// ===================================================================
// ## SCRIPT.JS - VERSÃO FINAL E COMPLETA (PARA O TESTE BETA) ##
// ===================================================================

// --- FUNÇÃO CRÍTICA PARA O LAYOUT NO TELEMÓVEL ---
const setAppHeight = () => {
    const doc = document.documentElement;
    doc.style.setProperty('--app-height', `${window.innerHeight}px`);
};
window.addEventListener('resize', setAppHeight);
setAppHeight();

// --- 1. CONFIGURAÇÃO E INICIALIZAÇÃO ---
const firebaseConfig = {
    // ###############################################################
    // ## COLE A SUA CONFIGURAÇÃO COMPLETA DO FIREBASE AQUI DENTRO ##
    // ###############################################################
    apiKey: "AIzaSyDz5FUlrXC07aQDMJ4XzomdT4gkyKZVKgg",
  authDomain: "arboriza-bd.firebaseapp.com",
  databaseURL: "https://arboriza-bd-default-rtdb.firebaseio.com",
  projectId: "arboriza-bd",
  storageBucket: "arboriza-bd.firebasestorage.app",
  messagingSenderId: "210425976523",
  appId: "1:210425976523:web:2733f5b67fe02aa7d4ad4e"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// A CHAVE API DO PLANTNET FOI REMOVIDA DAQUI.
// Ela é lida pela sua Função Netlify a partir das variáveis de ambiente.

// --- 2. ESTADO DA APLICAÇÃO ---
let currentUser = {
    id: "test_user_beta",
    name: "Usuário Beta",
    photoURL: "https://placehold.co/48x48/cccccc/FFFFFF?text=U",
    points: 0,
    treesCared: 0,
    treesIdentified: 0,
    treesAdded: 0,
    actionsDone: 0
};
let currentPlantInfo = null; // Guarda info da planta recém-identificada { commonName, scientificName }
let currentTree = null; // Guarda a árvore do DB { id, commonName, scientificName, status, location, address, coverPhoto, etc. }
let map;
let lastUserLocation = null; // Guarda a última localização do utilizador { latitude, longitude }
let exampleMarkers = []; // Guarda os marcadores de exemplo para poder removê-los

// --- 3. LÓGICA DE NAVEGAÇÃO E UI ---
const screens = document.querySelectorAll('main > div[id^="screen-"]');
const navButtons = document.querySelectorAll('.nav-btn');
const loadingModal = document.getElementById('loading-modal');
const loadingMessage = document.getElementById('loading-message');

const showPage = (pageId) => {
    screens.forEach(screen => screen.classList.add('hidden'));
    const activeScreen = document.getElementById(`screen-${pageId}`);
    if (activeScreen) {
        activeScreen.classList.remove('hidden');
    } else {
        console.error(`Tela com ID screen-${pageId} não encontrada! A voltar para o mapa.`); // Ajuda a depurar
        // Se a tela não for encontrada, volta para o mapa por segurança
        showPage('map'); 
        return;
    }

    const nav = document.querySelector('nav');
    nav.style.display = (pageId === 'onboarding') ? 'none' : 'flex';

    updateNavButtons(pageId);

    // Lógicas específicas de cada página
    if (pageId === 'map') {
        setTimeout(() => {
            if (!map) initializeMap();
            else map.invalidateSize(); // Garante que o mapa renderize corretamente se já existir
        }, 10); // Pequeno delay para garantir que o container está visível
    }
    if (pageId === 'feed') loadFeedPosts();
    if (pageId === 'profile' || pageId === 'achievements') updateGamificationUI();
};

const updateNavButtons = (currentPage) => {
    navButtons.forEach(btn => {
        btn.classList.toggle('text-verde-principal', btn.dataset.page === currentPage);
        btn.classList.toggle('text-gray-400', btn.dataset.page !== currentPage);
    });
};

const showLoadingModal = (show, message = "A carregar...") => {
    loadingMessage.textContent = message;
    loadingModal.classList.toggle('hidden', !show);
};

const showToast = (message) => {
    const toast = document.getElementById('toast-notification');
    toast.querySelector('p').textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
};

// --- 4. GAMIFICAÇÃO ---
const awardPoints = (action) => {
    let points = 0;
    switch (action) {
        case 'add_tree':
            points = 100;
            currentUser.treesAdded += 1;
            break;
        case 'care_tree':
            points = 50;
            currentUser.treesCared += 1;
            currentUser.actionsDone += 1;
            break;
        case 'identify_tree': // Apenas conta, não dá pontos diretamente aqui
            currentUser.treesIdentified += 1;
            break;
    }
    if (points > 0) {
        currentUser.points += points;
        showToast(`Você ganhou ${points} pontos!`);
    }
    updateGamificationUI();
    // No futuro: salvar `currentUser` no Firestore
};

const updateGamificationUI = () => {
    const pointsToLevelUp = 1000;
    // Garante que currentUser.points é um número
    const currentPoints = Number(currentUser.points) || 0; 
    const progress = Math.min((currentPoints / pointsToLevelUp) * 100, 100);

    // Atualiza Perfil
    document.getElementById('profile-points-text').textContent = currentPoints;
    document.getElementById('ranking-your-score').textContent = `${currentPoints} pts`;
    document.getElementById('profile-progress-bar').style.width = `${progress}%`;
    document.getElementById('profile-progress-text').textContent = `${Math.round(progress)}%`;
    document.getElementById('profile-stat-cared').textContent = `🌳 ${currentUser.treesCared}`;
    document.getElementById('profile-stat-identified').textContent = `🌿 ${currentUser.treesIdentified}`;
    document.getElementById('profile-stat-added').textContent = `📍 ${currentUser.treesAdded}`;

    // Atualiza Conquistas
    updateAchievementProgress('Guardiã Iniciante', currentUser.treesCared, 5);
    updateAchievementProgress('Botânica de Primeira', currentUser.treesIdentified, 10);
    updateAchievementProgress('Desbravador(a)', currentUser.treesAdded, 3);
};

const updateAchievementProgress = (name, current, goal) => {
    const achievementEl = document.querySelector(`[data-achievement="${name}"]`);
    if (achievementEl) {
        const progressBar = achievementEl.querySelector('.progress-bar');
        const counter = achievementEl.querySelector('.counter');
        if (progressBar) {
             progressBar.style.width = `${Math.min((current / goal) * 100, 100)}%`;
        }
        if(counter){
             counter.textContent = `${current}/${goal}`;
        }
    }
};


// --- 5. LÓGICA DO MAPA E FIREBASE ---
const initializeMap = () => {
    // Evita reinicializar o mapa se ele já existir
    if (map) { 
        map.invalidateSize();
        return;
    }
    
    map = L.map('map-container', { zoomControl: false }).setView([-22.894744, -43.294099], 17); // Centraliza na Nave
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    loadTreesOnMap(); // Carrega árvores reais
    loadExampleTrees(); // Carrega SEMPRE os exemplos
};

const centerMapOnUserLocation = () => {
    if ('geolocation' in navigator) {
        showLoadingModal(true, "Achando sua localização...");
        const options = { timeout: 20000, enableHighAccuracy: true }; // Aumenta o timeout
        navigator.geolocation.getCurrentPosition(
            (position) => {
                lastUserLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                map.setView([lastUserLocation.latitude, lastUserLocation.longitude], 17);
                // Remove marcador anterior se houver
                if (window.userMarker) map.removeLayer(window.userMarker); 
                // Adiciona novo marcador
                window.userMarker = L.marker([lastUserLocation.latitude, lastUserLocation.longitude]).addTo(map).bindPopup("Você está aqui!").openPopup();
                showLoadingModal(false);
            },
            (error) => {
                showLoadingModal(false);
                if (error.code === 3) showToast("A localização demorou muito para responder. Tente novamente.");
                else showToast("Não foi possível obter a sua localização. Verifique as permissões.");
                console.error("Erro de Geolocalização:", error);
            },
            options
        );
    } else {
        showToast("Geolocalização não suportada neste navegador.");
    }
};

const addTreeMarkerToMap = (tree, isExample = false) => {
    if (!tree.location || typeof tree.location.latitude !== 'number' || typeof tree.location.longitude !== 'number') {
        console.warn("Árvore sem dados de localização válidos:", tree);
        return; // Pula esta árvore
    }

    let iconUrl;
    switch (tree.status) {
        case 'healthy': iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'; break;
        case 'needs-care': iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png'; break;
        case 'critical': iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png'; break;
        default: iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png'; // Fallback
    }
    const treeIcon = L.icon({
        iconUrl: iconUrl,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    const marker = L.marker([tree.location.latitude, tree.location.longitude], { icon: treeIcon });
    // Adiciona o ID da árvore aos dados do marcador para referência futura
    marker.treeId = tree.id; 
    marker.isExample = isExample;
    marker.treeData = tree; // Guarda os dados completos no marcador

    marker.on('click', () => showTreeProfile(marker.treeId, marker.isExample, marker.treeData));
    marker.addTo(map);

    if (isExample) {
         exampleMarkers.push(marker); // Adiciona à lista
         console.log(`Pin de exemplo ${tree.id} adicionado em ${tree.location.latitude}, ${tree.location.longitude}`);
    }
};

const loadExampleTrees = () => {
    // Limpa marcadores de exemplo anteriores, se houver
    if (exampleMarkers.length > 0) {
        exampleMarkers.forEach(marker => map.removeLayer(marker));
        exampleMarkers = [];
    }
    const exampleTrees = [
        { id: 'example1', commonName: 'Ipê Amarelo (Exemplo)', scientificName: 'Handroanthus ochraceus', status: 'healthy', location: { latitude: -22.89450, longitude: -43.29430 }, address: 'Perto da Nave do Conhecimento', coverPhoto: 'https://images.unsplash.com/photo-1572917711979-5a507949b2c3?w=600&h=300&fit=crop&q=80' },
        { id: 'example2', commonName: 'Quaresmeira (Exemplo)', scientificName: 'Tibouchina granulosa', status: 'needs-care', location: { latitude: -22.89500, longitude: -43.29380 }, address: 'Perto da Nave do Conhecimento', coverPhoto: 'https://images.unsplash.com/photo-1616781105934-11059f8a3d1b?w=600&h=300&fit=crop&q=80' },
        { id: 'example3', commonName: 'Sibipiruna (Exemplo)', scientificName: 'Caesalpinia pluviosa', status: 'critical', location: { latitude: -22.89420, longitude: -43.29350 }, address: 'Perto da Nave do Conhecimento', coverPhoto: 'https://images.unsplash.com/photo-1558013589-9a7e6b7c5c06?w=600&h=300&fit=crop&q=80' }
    ];
    exampleTrees.forEach(tree => addTreeMarkerToMap(tree, true));
    console.log("Pins de exemplo carregados.");
};

const loadTreesOnMap = async () => {
    try {
        const treesCollection = await db.collection('trees').get();
        if (treesCollection.empty) {
             console.log("Nenhuma árvore real encontrada no DB.");
        } else {
            console.log("Árvores reais encontradas, a adicioná-las ao mapa.");
            treesCollection.forEach(doc => {
                const tree = { id: doc.id, ...doc.data() };
                addTreeMarkerToMap(tree);
            });
        }
    } catch (error) {
        console.error("Erro ao carregar árvores do DB:", error);
    }
    // Garante que os exemplos são carregados SEMPRE (para o beta)
    if (exampleMarkers.length === 0 && map) { // Verifica se o mapa já existe
         loadExampleTrees();
    } else if (map) {
         // Se exemplos já existem, apenas os traz para a frente (caso sobreponham)
         exampleMarkers.forEach(m => {
             if (m && typeof m.bringToFront === 'function') { // Verifica se a função existe
                 m.bringToFront();
             }
         });
    }
};


const showTreeProfile = (treeId, isExample = false, exampleData = null) => {
    let treeDataPromise;

    if (isExample && exampleData) {
        treeDataPromise = Promise.resolve(exampleData); // Usa os dados de exemplo diretamente
        currentTree = { ...exampleData }; // Clona os dados para evitar modificação acidental
    } else {
        treeDataPromise = db.collection('trees').doc(treeId).get().then(doc => {
            if (!doc.exists) throw new Error("Árvore não encontrada");
            currentTree = { id: doc.id, ...doc.data() }; // Define a árvore atual como a do DB
            return currentTree;
        });
    }

    treeDataPromise.then(tree => {
        // Preenche os dados básicos do perfil
        document.getElementById('tree-profile-name').textContent = tree.commonName || 'Nome não definido';
        document.getElementById('tree-profile-scientific-name').textContent = tree.scientificName || '';
        document.getElementById('tree-profile-address').querySelector('span').textContent = tree.address || (tree.location ? `${tree.location.latitude.toFixed(5)}, ${tree.location.longitude.toFixed(5)}` : "Localização não disponível");
        document.getElementById('tree-profile-image').src = tree.coverPhoto || 'https://placehold.co/600x300/81C784/FFFFFF?text=Árvore';

        // Atualiza o status visual
        const statusBadge = document.getElementById('tree-profile-status-badge');
        if (tree.status === 'healthy') { statusBadge.className = 'bg-sucesso text-white text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Saudável'; }
        else if (tree.status === 'needs-care') { statusBadge.className = 'bg-alerta text-yellow-800 text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Precisa de Cuidado'; }
        else { statusBadge.className = 'bg-erro text-white text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Em Estado Crítico'; }

        // Carrega o histórico e mural
        const historyContainer = document.getElementById('tree-profile-history');
        const timelineContainer = document.getElementById('tree-profile-timeline');
        const padrinhosContainer = document.getElementById('tree-profile-padrinhos');

        historyContainer.innerHTML = '';
        timelineContainer.innerHTML = '';
        padrinhosContainer.innerHTML = ''; // Limpa padrinhos anteriores

        if (isExample) {
            historyContainer.innerHTML = `<div class="p-1 border-b"><span class="font-semibold">${new Date().toLocaleDateString('pt-BR')}:</span> Usuário Exemplo regou.</div>`;
            timelineContainer.innerHTML = `<div class="bg-cinza p-3 rounded-lg"><p class="text-sm italic">"Que árvore linda! Feliz em ajudar."</p><span class="text-xs font-semibold text-gray-600">- Usuário Exemplo</span></div>`;
            padrinhosContainer.innerHTML = `<span class="bg-verde-claro text-sm font-semibold px-2 py-1 rounded-full">Usuário Exemplo</span>`;
        } else {
            // Busca os eventos reais do Firebase
            db.collection('trees').doc(treeId).collection('careEvents').orderBy('timestamp', 'desc').get().then(snapshot => {
                if (snapshot.empty) {
                    historyContainer.innerHTML = `<p class="text-gray-500">Nenhuma ação registrada.</p>`;
                    timelineContainer.innerHTML = `<div class="text-center p-4 bg-gray-100 rounded-lg">Nenhuma mensagem ainda.</div>`;
                } else {
                    snapshot.forEach(doc => {
                        const event = doc.data();
                        // Verifica se os dados do evento e do utilizador existem
                        if (!event || !event.user || !event.action) {
                             console.warn("Evento inválido encontrado:", doc.id, event);
                             return; // Pula este evento
                        }
                        const eventDate = event.timestamp ? event.timestamp.toDate().toLocaleDateString('pt-BR') : 'sem data';
                        
                        // Adiciona ao Histórico
                        const historyHtml = `<div class="p-1 border-b"><span class="font-semibold">${eventDate}:</span> ${event.user.name || 'Alguém'} ${event.action}</div>`;
                        historyContainer.innerHTML += historyHtml;

                        // Adiciona ao Mural (apenas se houver mensagem)
                        if (event.message) {
                            const isFirst = event.action.includes("cadastrou");
                            const timelineHtml = `
                                <div class="bg-cinza p-3 rounded-lg fade-in relative">
                                    <div class="flex items-center mb-2">
                                        <img src="${event.user.photoURL || 'https://placehold.co/32x32/cccccc/FFFFFF?text=?'}" class="w-8 h-8 rounded-full object-cover">
                                        <p class="ml-2 font-semibold text-sm">${event.user.name || 'Anónimo'}</p>
                                        <p class="ml-auto text-xs text-gray-500">${eventDate}</p>
                                    </div>
                                    ${event.photoUrl ? `<img src="${event.photoUrl}" class="w-full h-auto rounded-lg object-cover my-2">` : ''}
                                    <p class="text-sm text-gray-700 italic">"${event.message}"</p>
                                    ${isFirst ? '<span class="absolute -top-2 -right-2 text-xs bg-alerta text-yellow-800 font-semibold px-2 py-0.5 rounded-full shadow-md">✨ Primeira Mensagem</span>' : ''}
                                </div>`;
                            timelineContainer.innerHTML += timelineHtml;
                        }
                    });
                }
            }).catch(err => {
                console.error("Erro ao carregar eventos:", err);
                historyContainer.innerHTML = `<p class="text-erro">Erro ao carregar histórico.</p>`;
                timelineContainer.innerHTML = `<p class="text-erro">Erro ao carregar mural.</p>`;
             });
            // Lógica futura para carregar padrinhos do Firebase
            padrinhosContainer.innerHTML = `<span class="bg-verde-claro text-sm font-semibold px-2 py-1 rounded-full">Você (Exemplo)</span>`;
        }

        showPage('tree-profile');

    }).catch(error => {
        console.error("Erro ao carregar perfil da árvore:", error);
        showToast("Não foi possível carregar os detalhes desta árvore.");
    });
};


const uploadImage = async (file) => {
    if (!file) return null;
    const filePath = `photos/${Date.now()}_${file.name}`; // Pasta genérica para todas as fotos
    const fileRef = storage.ref(filePath);
    await fileRef.put(file);
    return fileRef.getDownloadURL();
};

const handleFinishCare = async () => {
    if (!currentTree || currentTree.id.startsWith('example')) { // Não permite cuidar de exemplos
        showToast("Não é possível cuidar de uma árvore de exemplo.");
        return;
    }
    showLoadingModal(true, "Registrando seu cuidado...");
    const message = document.getElementById('care-message').value;
    const photoFile = document.getElementById('care-photo-input').files[0];
    try {
        const photoUrl = await uploadImage(photoFile);
        const careEvent = {
            action: "cuidou da planta.", // Poderia ser mais específico baseado no botão clicado
            message: message,
            photoUrl: photoUrl,
            user: { id: currentUser.id, name: currentUser.name, photoURL: currentUser.photoURL },
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('trees').doc(currentTree.id).collection('careEvents').add(careEvent);
        awardPoints('care_tree');
        showToast("Cuidado registrado com sucesso! 🌳");
        showPage('map');
        // Limpa os campos
        document.getElementById('care-message').value = '';
        document.getElementById('care-photo-input').value = null;
        document.getElementById('care-confirmation-section').classList.add('hidden');

    } catch (error) {
        console.error("Erro ao finalizar cuidado:", error);
        showToast("Ocorreu um erro ao registrar o seu cuidado.");
    } finally {
        showLoadingModal(false);
    }
};

const loadFeedPosts = async () => {
    const feedContainer = document.getElementById('feed-posts-container');
    feedContainer.innerHTML = '<p class="text-center text-gray-500">A carregar o feed da galera...</p>';
    try {
        const snapshot = await db.collectionGroup('careEvents').orderBy('timestamp', 'desc').limit(10).get();
        if (snapshot.empty) throw new Error("Feed vazio");
        feedContainer.innerHTML = ''; // Limpa a mensagem de "carregando"
        snapshot.forEach(doc => {
            const event = doc.data();
            // Verifica se os dados do utilizador existem
            if (!event.user || !event.user.name || !event.user.photoURL) {
                console.warn("Evento com dados de utilizador incompletos:", event);
                return; // Pula este post se os dados do utilizador estiverem em falta
            }
            const eventDate = event.timestamp ? event.timestamp.toDate().toLocaleDateString('pt-BR') : 'sem data';
            const postHtml = `
                <div class="bg-white p-4 rounded-lg border fade-in">
                    <div class="flex items-center mb-3">
                        <img src="${event.user.photoURL}" class="w-12 h-12 rounded-full object-cover">
                        <div class="ml-3"><p class="font-bold">${event.user.name}</p><p class="text-xs text-gray-500">${eventDate}</p></div>
                    </div>
                    <p class="mb-3">${event.message || 'Realizou uma ação de cuidado!'}</p>
                    ${event.photoUrl ? `<img src="${event.photoUrl}" class="w-full h-auto rounded-lg object-cover">` : ''}
                </div>`;
            feedContainer.innerHTML += postHtml;
        });
    } catch (error) {
        console.warn("Não foi possível carregar o feed do Firebase, a mostrar exemplos.");
        feedContainer.innerHTML = `
            <div class="bg-white p-4 rounded-lg border">
                <div class="flex items-center mb-3"><img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&q=80" class="w-12 h-12 rounded-full object-cover"><div class="ml-3"><p class="font-bold">Carlos (Exemplo)</p><p class="text-xs text-gray-500">2h atrás</p></div></div>
                <p class="mb-3">Dei um trato nessa Aroeira aqui perto de casa. Tava precisando de um carinho! #PartiuArboriza</p>
                <img src="https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=500&h=300&fit=crop&q=80" class="w-full h-auto rounded-lg object-cover">
            </div>`;
    }
};

// --- 6. FLUXO DE IDENTIFICAÇÃO E CADASTRO ---
const handlePlantIdentification = async (file) => {
    if (!file) return;
    const resultImageEl = document.getElementById('result-plant-image');
    resultImageEl.src = URL.createObjectURL(file);
    showPage('result');
    showLoadingModal(true, "Identificando a planta...");
    let success = false;
    const formData = new FormData();
    formData.append('images', file);
    // NÃO ENVIAMOS A CHAVE DAQUI
    // formData.append('apiKey', PLANTNET_API_KEY); 

    try {
        // Usa o caminho relativo para a função Netlify
        const response = await fetch('/.netlify/functions/identify', { method: 'POST', body: formData }); 
        
        if (!response.ok) {
            let errorData;
            try { errorData = await response.json(); } catch (e) { /* Ignora erro no json */ }
            throw new Error(`Erro do servidor: ${response.status} - ${errorData?.error || response.statusText}`);
        }
        
        const data = await response.json();
        success = true; // Comunicação OK
        const bestMatch = data.results?.[0];

        if (bestMatch) {
            currentPlantInfo = {
                commonName: bestMatch.species.commonNames?.[0] || 'Nome popular não disponível',
                scientificName: bestMatch.species.scientificNameWithoutAuthor,
                score: bestMatch.score
            };
            document.getElementById('result-common-name').textContent = currentPlantInfo.commonName;
            document.getElementById('result-scientific-name').textContent = currentPlantInfo.scientificName;
            const confidence = Math.round(currentPlantInfo.score * 100);
            document.getElementById('result-confidence').textContent = `${confidence}%`;
            document.getElementById('result-confidence-bar').style.width = `${confidence}%`;
        } else {
            currentPlantInfo = null; // Limpa info se não identificou
            document.getElementById('result-common-name').textContent = "Identificação incerta";
            document.getElementById('result-scientific-name').textContent = "Tente uma foto com melhor iluminação.";
            document.getElementById('result-confidence').textContent = `0%`;
            document.getElementById('result-confidence-bar').style.width = `0%`;
            showToast(data.message || "Não foi possível identificar a planta.");
        }
    } catch (error) {
        console.error("Falha na chamada via Netlify:", error);
        currentPlantInfo = null; // Limpa info em caso de erro grave
        document.getElementById('result-common-name').textContent = "Erro na identificação";
        document.getElementById('result-scientific-name').textContent = "Verifique sua conexão.";
        document.getElementById('result-confidence').textContent = `0%`;
        document.getElementById('result-confidence-bar').style.width = `0%`;
        showToast(error.message.includes('servidor') ? error.message : "Não foi possível conectar ao sistema de identificação."); 
    } finally {
        showLoadingModal(false);
    }
};

const initiateCareFlow = () => {
    if (!currentPlantInfo) {
        showToast("Erro: Nenhuma planta identificada.");
        return;
    }
    // Pontos de identificação só são dados aqui, após a confirmação
    awardPoints('identify_tree'); 
    
    // Lógica futura: verificar se árvore existe no DB
    const treeExists = false; 

    if (treeExists) {
        // Mostra a tela de cuidado normal
        showPage('care');
        document.getElementById('care-title').textContent = currentPlantInfo.commonName;
        document.getElementById('care-subtitle').textContent = "O que esta belezura precisa hoje?";
        document.getElementById('care-actions-container').classList.remove('hidden');
        document.getElementById('add-tree-button-container').classList.add('hidden');
         // Garante que os botões de cuidar estão habilitados
        document.getElementById('action-water').disabled = false;
        document.getElementById('action-clean').disabled = false;
        document.getElementById('action-water').style.pointerEvents = 'auto'; 
        document.getElementById('action-clean').style.pointerEvents = 'auto'; 
        // Limpa estilos de desabilitado se existirem
        document.getElementById('action-water').classList.remove('opacity-50', 'cursor-not-allowed');
        document.getElementById('action-clean').classList.remove('opacity-50', 'cursor-not-allowed');

    } else {
        // Mostra a tela de cuidado adaptada para cadastro
        showPage('care');
        document.getElementById('care-title').textContent = "Árvore não cadastrada!";
        document.getElementById('care-subtitle').textContent = "Gostaria de adicionar esta nova amiga ao mapa?";
        document.getElementById('care-actions-container').classList.remove('hidden'); // Mostra ações
        document.getElementById('add-tree-button-container').classList.remove('hidden'); // Mostra botão de cadastrar
        // Desabilita botões de cuidar
        document.getElementById('action-water').disabled = true;
        document.getElementById('action-clean').disabled = true;
        // Adiciona estilo visual de desabilitado
        document.getElementById('action-water').classList.add('opacity-50', 'cursor-not-allowed');
        document.getElementById('action-clean').classList.add('opacity-50', 'cursor-not-allowed');
        document.getElementById('action-water').style.pointerEvents = 'none'; // Impede clique
        document.getElementById('action-clean').style.pointerEvents = 'none'; // Impede clique
    }
};

const handleRegisterNewTree = async () => {
    if (!currentPlantInfo || !lastUserLocation) {
        showToast("Localização exata necessária. Tente se localizar no mapa primeiro.");
        return;
    }
    showLoadingModal(true, "Cadastrando nova árvore...");

    const health = document.getElementById('add-tree-health').value;
    const message = document.getElementById('add-tree-message').value;
    const photoFile = document.getElementById('add-tree-photo-input').files[0];

    try {
        //const photoUrl = await uploadImage(photoFile); // Upload da foto da árvore
        const photoUrl = null; // <--Vamos pular o upload por enquanto que não temos plano no firebase.
        
        const newTree = {
            commonName: currentPlantInfo.commonName,
            scientificName: currentPlantInfo.scientificName,
            status: health,
            location: new firebase.firestore.GeoPoint(lastUserLocation.latitude, lastUserLocation.longitude),
            coverPhoto: photoUrl || 'https://placehold.co/600x300/81C784/FFFFFF?text=Árvore',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('trees').add(newTree);
        if (message || photoUrl) {
            const firstMessage = {
                action: "cadastrou esta árvore.",
                message: message || "Adicionou esta árvore!",
                user: { id: currentUser.id, name: currentUser.name, photoURL: currentUser.photoURL },
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                photoUrl: photoUrl
            };
            await db.collection('trees').doc(docRef.id).collection('careEvents').add(firstMessage);
        }
        awardPoints('add_tree');
        addTreeMarkerToMap({ id: docRef.id, ...newTree });
        showToast("Árvore cadastrada com sucesso!");
        if (confirm("Arvoreco na área! Árvore acolhida. Quer compartilhar no feed?")) {
            showToast("Compartilhado com a galera!");
        }
        showPage('map');
        document.getElementById('add-tree-photo-input').value = null;
        document.getElementById('add-tree-photo-preview').classList.add('hidden');
        document.getElementById('add-tree-message').value = '';
    } catch (error) {
        console.error("Erro ao cadastrar árvore:", error);
        showToast("Ocorreu um erro ao cadastrar a árvore.");
    } finally {
        showLoadingModal(false);
    }
};

// --- 7. SABER MAIS ---
const curatedContent = {
    "Como melhorar a terra do canteiro?": { intro: "A @erika.canton tem uma dica de ouro...", title: "Adubação Power...", creator: "@erika.canton", url: "https://www.instagram.com/p/DO-4c94Dd6J/" },
    "Por que não pode pintar os troncos das árvores?": { intro: "O mestre @ricardo__cardim explica...", title: "Tronco não é parede!", creator: "@ricardo__cardim", url: "https://www.instagram.com/p/DOt6dqtjkmp/" },
    "Como proteger uma árvore jovem?": { intro: "Proteger as árvores mais novas é fundamental...", title: "Cuidando do futuro", creator: "@ricardo__cardim", url: "https://www.instagram.com/p/DOt6dqtjkmp/" }
};
const handleLearnSearch = (query) => {
    if (!query) return;
    const resultsContainer = document.getElementById('learn-results-container');
    resultsContainer.innerHTML = ''; // Limpa resultados anteriores
    resultsContainer.classList.remove('hidden');
    const content = curatedContent[query];
    if (content) {
        resultsContainer.innerHTML = `
            <p class="text-gray-700 mb-3">${content.intro}</p>
            <a href="${content.url}" target="_blank" rel="noopener noreferrer" class="block bg-cinza rounded-lg overflow-hidden hover:bg-gray-200 transition-all shadow-sm">
                <div class="w-full h-48 bg-gray-300 flex items-center justify-center">
                    <i data-lucide="instagram" class="w-12 h-12 text-gray-500"></i>
                </div>
                <div class="p-3">
                    <p class="font-bold text-md">${content.title}</p>
                    <p class="text-sm text-verde-principal font-semibold">${content.creator}</p>
                </div>
            </a>`;
        lucide.createIcons();
    } else {
        resultsContainer.innerHTML = `<p class="text-center text-gray-600">O Arvoreco ainda está a aprender sobre "${query}". Tente uma das sugestões!</p>`;
    }
};


// --- 8. EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    showPage('onboarding'); // Começa sempre no onboarding

    // Listener de Navegação Principal
    document.body.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.nav-btn, .nav-to-btn');
        if (navBtn && navBtn.dataset.page) { 
            e.preventDefault();
            showPage(navBtn.dataset.page);
        }
    });

    // Listener para carregar foto para identificar
    document.getElementById('plant-photo-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handlePlantIdentification(e.target.files[0]);
        }
    });
    
    // Listener Botão "Não, tentar de novo" na tela de Resultado
    document.getElementById('btn-confirm-no').addEventListener('click', () => {
        showToast("Tente tirar uma foto de outro ângulo.");
        document.getElementById('plant-photo-input').value = null; // Limpa o input
        showPage('camera');
    });
    
    // Listener Botão "Sim, cuidar dela!" na tela de Resultado
    document.getElementById('btn-initiate-care').addEventListener('click', initiateCareFlow);

    // Listener Botão Finalizar Cadastro de Árvore
    document.getElementById('btn-finish-add-tree').addEventListener('click', handleRegisterNewTree);

    // Listener Botão de Localização no Mapa
    document.getElementById('btn-locate-me').addEventListener('click', centerMapOnUserLocation);

    // Listener Botão Finalizar Cuidado (depois de regar/limpar)
    document.getElementById('btn-finish-care').addEventListener('click', handleFinishCare);
    
    // Listener para o botão de abrir a confirmação de cuidado
    document.querySelectorAll('.care-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!btn.disabled) {
                document.getElementById('care-confirmation-section').classList.remove('hidden');
            }
        });
    });

    // Listener para mostrar preview da foto ao cadastrar árvore
    document.getElementById('add-tree-photo-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const preview = document.getElementById('add-tree-photo-preview');
            preview.src = URL.createObjectURL(e.target.files[0]);
            preview.classList.remove('hidden');
        }
    });

    // Listeners da Aba "Saber Mais"
    document.querySelectorAll('.suggested-question-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const query = btn.textContent;
            document.getElementById('learn-search-input').value = query;
            handleLearnSearch(query);
        });
    });
    document.getElementById('learn-search-btn').addEventListener('click', () => {
        const query = document.getElementById('learn-search-input').value;
        handleLearnSearch(query);
    });

    // Listener para o botão de Cuidar a partir do Perfil da Árvore
     document.getElementById('btn-care-from-profile').addEventListener('click', () => {
        if(currentTree && !currentTree.id.startsWith('example')){ // Só permite cuidar se for uma árvore real
            showPage('care');
            document.getElementById('care-title').textContent = currentTree.commonName;
            document.getElementById('care-subtitle').textContent = "O que esta belezura precisa hoje?";
            document.getElementById('care-actions-container').classList.remove('hidden');
            document.getElementById('add-tree-button-container').classList.add('hidden');
            document.getElementById('action-water').disabled = false;
            document.getElementById('action-clean').disabled = false;
            document.getElementById('action-water').style.pointerEvents = 'auto'; 
            document.getElementById('action-clean').style.pointerEvents = 'auto'; 
            document.getElementById('action-water').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('action-clean').classList.remove('opacity-50', 'cursor-not-allowed');
        } else if (currentTree && currentTree.id.startsWith('example')) {
            showToast("Não é possível cuidar de uma árvore de exemplo.");
        } else {
             showToast("Erro ao carregar dados da árvore.");
        }
    });
});