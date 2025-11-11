// ===================================================================
// ## SCRIPT.JS - VERSÃO 1.0.1 (Refatorado com Autenticação) ##
// ===================================================================

// --- IMPORTAÇÕES DO FIREBASE (v9+ Modular) ---
// Importamos as funções que precisamos dos módulos do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    addDoc,
    collection,
    query,
    getDocs,
    onSnapshot, // Para carregar dados em tempo real
    orderBy,
    limit,
    collectionGroup,
    serverTimestamp,
    GeoPoint, // Importante para localização
    updateDoc,
    deleteDoc,
    Timestamp // Para datas
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- 1. CONFIGURAÇÃO E INICIALIZAÇÃO ---
const firebaseConfig = {
    // ###############################################################
    // ## COLE A SUA CONFIGURAÇÃO COMPLETA DO FIREBASE AQUI DENTRO ##
    // ###############################################################
    // Exemplo:
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_AUTH_DOMAIN",
    projectId: "SEU_PROJECT_ID",
    storageBucket: "SEU_STORAGE_BUCKET",
    messagingSenderId: "SEU_MESSAGING_SENDER_ID",
    appId: "SEU_APP_ID"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- 2. ESTADO GLOBAL DA APLICAÇÃO ---
// Usamos um objeto para guardar o estado da aplicação
const appState = {
    currentUser: null, // Guarda os dados do usuário logado (vem do Firestore)
    currentTree: null, // Guarda a árvore selecionada
    currentPlantInfo: null, // Guarda info da planta recém-identificada
    lastUserLocation: null, // Guarda { latitude, longitude }
    locationPermissionGranted: false, // Controla permissão
    map: null, // Guarda a instância do mapa
    userMarker: null, // Guarda o marcador do usuário
    treeMarkers: {} // Guarda os marcadores das árvores
};

// --- 3. FUNÇÕES PRINCIPAIS (Ciclo de Vida da App) ---

// Função que roda assim que o script carrega
const initializeAppCore = () => {
    console.log("Arboriza 1.0.1 iniciando...");
    setAppHeight(); // Ajusta altura para 100vh em mobile
    window.addEventListener('resize', setAppHeight);
    lucide.createIcons(); // Carrega ícones

    // Ouve todas as mudanças de autenticação (login, logout)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Usuário está logado
            console.log("Usuário logado:", user.uid);
            fetchUserProfile(user.uid);
        } else {
            // Usuário está deslogado
            console.log("Nenhum usuário logado.");
            appState.currentUser = null;
            // Mostra a tela de onboarding (que leva ao login/signup)
            showPage('onboarding');
            // Esconde os elementos principais da UI
            document.querySelector('main').classList.add('hidden');
            document.querySelector('nav').classList.add('hidden');
        }
    });

    // Adiciona todos os event listeners da aplicação
    setupEventListeners();
};

// Busca o perfil do usuário no Firestore após o login
const fetchUserProfile = async (uid) => {
    showLoadingModal(true, "Carregando seu perfil...");
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        appState.currentUser = { uid: uid, ...userSnap.data() };
        console.log("Perfil do usuário carregado:", appState.currentUser);
        
        // Usuário logado e perfil carregado, mostra a app principal
        document.querySelector('main').classList.remove('hidden');
        document.querySelector('nav').classList.remove('hidden');
        
        // ATUALIZAÇÃO: Pede localização ANTES de ir para o mapa
        promptForLocation(); 

    } else {
        // Isso pode acontecer se o cadastro falhar em criar o doc
        console.error("Usuário logado, mas sem perfil no Firestore!");
        showToast("Erro ao carregar seu perfil. Tente logar novamente.");
        handleLogout();
    }
    showLoadingModal(false);
};

// --- 4. LÓGICA DE NAVEGAÇÃO E UI ---
const screens = document.querySelectorAll('#app-container > div[id^="screen-"], main > div[id^="screen-"]');
const navButtons = document.querySelectorAll('.nav-btn');
const loadingModal = document.getElementById('loading-modal');
const loadingMessage = document.getElementById('loading-message');

const showPage = (pageId) => {
    // Proteção de rotas: se não estiver logado, só pode ver onboarding, login e signup
    const publicPages = ['onboarding', 'login', 'signup'];
    if (!appState.currentUser && !publicPages.includes(pageId)) {
        console.warn(`Acesso bloqueado à página ${pageId}. Redirecionando para login.`);
        showPage('login');
        return;
    }

    screens.forEach(screen => screen.classList.add('hidden'));
    const activeScreen = document.getElementById(`screen-${pageId}`);
    
    if (activeScreen) {
        activeScreen.classList.remove('hidden');
    } else {
        console.error(`Tela com ID screen-${pageId} não encontrada! Voltando para o mapa.`);
        showPage('map'); // Fallback seguro
        return;
    }

    // Esconde a nav em páginas de autenticação
    const authPages = ['onboarding', 'login', 'signup'];
    const nav = document.querySelector('nav');
    if (nav) {
        nav.style.display = authPages.includes(pageId) ? 'none' : 'flex';
    }

    updateNavButtons(pageId);

    // Lógicas específicas de cada página
    if (pageId === 'map') {
        setTimeout(() => {
            if (appState.map) appState.map.invalidateSize();
        }, 10);
    }
    if (pageId === 'feed') loadFeedPosts();
    if (pageId === 'profile' || pageId === 'achievements') updateGamificationUI();
    if (pageId === 'camera') requestCameraAccess(); // ATUALIZAÇÃO: Pede câmera
};

const updateNavButtons = (currentPage) => {
    navButtons.forEach(btn => {
        btn.classList.toggle('text-verde-principal', btn.dataset.page === currentPage);
        btn.classList.toggle('text-gray-400', btn.dataset.page !== currentPage);
    });
};

const showLoadingModal = (show, message = "Carregando...") => {
    loadingMessage.textContent = message;
    loadingModal.classList.toggle('hidden', !show);
};

const showToast = (message) => {
    const toast = document.getElementById('toast-notification');
    toast.querySelector('p').textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
};

// --- 5. LÓGICA DE AUTENTICAÇÃO ---

const handleSignup = async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const errorMessageEl = document.getElementById('signup-error-message');

    if (name.length < 3) {
        errorMessageEl.textContent = "Por favor, insira um nome válido.";
        errorMessageEl.classList.remove('hidden');
        return;
    }

    showLoadingModal(true, "Criando sua conta...");
    errorMessageEl.classList.add('hidden');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Usuário criado! Agora, cria o perfil dele no Firestore
        const userRef = doc(db, "users", user.uid);
        const newUserProfile = {
            name: name,
            email: email,
            photoURL: `https://placehold.co/128x128/cccccc/FFFFFF?text=${name.charAt(0).toUpperCase()}`,
            level: 1,
            levelName: "Semente",
            points: 0,
            treesCared: 0,
            treesIdentified: 0,
            treesAdded: 0,
            createdAt: serverTimestamp()
        };
        
        await setDoc(userRef, newUserProfile);
        
        // O onAuthStateChanged vai pegar essa mudança e logar o usuário
        console.log("Conta e perfil criados com sucesso!");
        
    } catch (error) {
        console.error("Erro no cadastro:", error);
        errorMessageEl.textContent = getFirebaseErrorMessage(error);
        errorMessageEl.classList.remove('hidden');
    } finally {
        showLoadingModal(false);
    }
};

const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorMessageEl = document.getElementById('login-error-message');

    showLoadingModal(true, "Entrando...");
    errorMessageEl.classList.add('hidden');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Sucesso! O onAuthStateChanged vai cuidar do resto.
        console.log("Login com sucesso!");

    } catch (error) {
        console.error("Erro no login:", error);
        errorMessageEl.textContent = getFirebaseErrorMessage(error);
        errorMessageEl.classList.remove('hidden');
    } finally {
        showLoadingModal(false);
    }
};

const handleLogout = async () => {
    try {
        await signOut(auth);
        // Sucesso! O onAuthStateChanged vai cuidar do resto.
        appState.map = null; // Destrói a instância do mapa
        showPage('onboarding');
    } catch (error) {
        console.error("Erro ao sair:", error);
        showToast("Erro ao tentar sair.");
    }
};

const getFirebaseErrorMessage = (error) => {
    switch (error.code) {
        case 'auth/email-already-in-use':
            return 'Este email já está em uso.';
        case 'auth/invalid-email':
            return 'Email inválido.';
        case 'auth/weak-password':
            return 'A senha precisa ter pelo menos 6 caracteres.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Email ou senha incorretos.';
        default:
            return 'Ocorreu um erro. Tente novamente.';
    }
};


// --- 6. GAMIFICAÇÃO (Agora com Firestore) ---

const awardPoints = async (action) => {
    if (!appState.currentUser) return;

    let points = 0;
    let newStats = { ...appState.currentUser }; // Copia estado atual

    switch (action) {
        case 'add_tree':
            points = 100;
            newStats.treesAdded = (newStats.treesAdded || 0) + 1;
            break;
        case 'care_tree':
            points = 50;
            newStats.treesCared = (newStats.treesCared || 0) + 1;
            break;
        case 'identify_tree':
            points = 10; // Dando 10 pontos por identificar
            newStats.treesIdentified = (newStats.treesIdentified || 0) + 1;
            break;
        case 'adopt_tree':
            points = 20; // Pontos por adotar
            break;
    }

    if (points > 0) {
        newStats.points = (newStats.points || 0) + points;
        showToast(`Você ganhou ${points} pontos!`);
        
        // Atualiza o estado local
        appState.currentUser = newStats;
        
        // Atualiza no Firestore
        const userRef = doc(db, "users", appState.currentUser.uid);
        try {
            await updateDoc(userRef, {
                points: newStats.points,
                treesAdded: newStats.treesAdded,
                treesCared: newStats.treesCared,
                treesIdentified: newStats.treesIdentified
            });
            console.log("Pontos do usuário atualizados no Firestore.");
        } catch (error) {
            console.error("Erro ao atualizar pontos:", error);
        }
    }
    updateGamificationUI();
};

const updateGamificationUI = () => {
    const user = appState.currentUser;
    if (!user) return;

    // Atualiza Perfil
    document.getElementById('profile-name').textContent = user.name || 'Guardião';
    document.getElementById('profile-avatar').src = user.photoURL || `https://placehold.co/128x128/cccccc/FFFFFF?text=${user.name.charAt(0)}`;
    document.getElementById('profile-level').textContent = user.levelName || 'Nível 1: Semente';
    
    const pointsToLevelUp = 1000; // Exemplo
    const currentPoints = Number(user.points) || 0; 
    const progress = Math.min((currentPoints / pointsToLevelUp) * 100, 100);

    document.getElementById('profile-points-text').textContent = currentPoints;
    document.getElementById('profile-progress-bar').style.width = `${progress}%`;
    document.getElementById('profile-progress-text').textContent = `${Math.round(progress)}%`;
    document.getElementById('profile-stat-cared').textContent = `🌳 ${user.treesCared || 0}`;
    document.getElementById('profile-stat-identified').textContent = `🌿 ${user.treesIdentified || 0}`;
    document.getElementById('profile-stat-added').textContent = `📍 ${user.treesAdded || 0}`;
    
    // ATUALIZAÇÃO: Carrega árvores adotadas no perfil
    loadAdoptedTreesForProfile();

    // Atualiza Conquistas
    updateAchievementProgress('Guardiã Iniciante', user.treesCared || 0, 5);
    updateAchievementProgress('Botânica de Primeira', user.treesIdentified || 0, 10);
    updateAchievementProgress('Desbravador(a)', user.treesAdded || 0, 3);
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

const loadAdoptedTreesForProfile = async () => {
    const listEl = document.getElementById('adopted-trees-list');
    if (!appState.currentUser) return;

    listEl.innerHTML = `<p class="text-gray-500 text-center italic">Carregando árvores...</p>`;
    
    const q = query(collection(db, "users", appState.currentUser.uid, "adoptedTrees"), orderBy("adoptedAt", "desc"));
    
    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            listEl.innerHTML = `<p class="text-gray-500 text-center italic">Nenhuma árvore adotada ainda.</p>`;
            return;
        }
        
        listEl.innerHTML = ''; // Limpa o "carregando"
        querySnapshot.forEach((doc) => {
            const tree = doc.data();
            const treeId = doc.id;
            const el = document.createElement('div');
            el.className = "bg-cinza p-3 rounded-lg flex items-center gap-3 cursor-pointer";
            el.innerHTML = `
                <img src="${tree.coverPhoto || 'https://placehold.co/60x60/81C784/FFFFFF?text=🌳'}" class="w-12 h-12 rounded-lg object-cover">
                <div>
                    <p class="font-bold text-verde-principal">${tree.commonName}</p>
                    <p class="text-sm text-gray-600 italic">${tree.scientificName}</p>
                </div>
                <i data-lucide="chevron-right" class="ml-auto text-gray-400"></i>
            `;
            // Adiciona listener para ir ao perfil da árvore
            el.addEventListener('click', () => showTreeProfile(treeId));
            listEl.appendChild(el);
        });
        lucide.createIcons();

    } catch (error) {
        console.error("Erro ao carregar árvores adotadas:", error);
        listEl.innerHTML = `<p class="text-erro text-center">Erro ao carregar árvores.</p>`;
    }
};


// --- 7. LÓGICA DO MAPA E FIREBASE ---

// ATUALIZAÇÃO: Pede permissão de localização
const promptForLocation = () => {
    // Se já temos a permissão, apenas inicia o mapa
    if (appState.locationPermissionGranted) {
        console.log("Permissão de localização já concedida.");
        showPage('map');
        initializeMap(); // Inicializa o mapa
        centerMapOnUserLocation(); // Centraliza no usuário
        return;
    }

    // Se não temos, mostra o modal
    const modal = document.getElementById('location-permission-modal');
    modal.classList.remove('hidden');

    document.getElementById('btn-grant-location').onclick = async () => {
        modal.classList.add('hidden');
        showLoadingModal(true, "Achando sua localização...");
        
        try {
            const position = await getCurrentLocation();
            appState.lastUserLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            appState.locationPermissionGranted = true;
            console.log("Localização obtida:", appState.lastUserLocation);
            
            showPage('map');
            initializeMap(); // Inicializa o mapa

        } catch (error) {
            console.error("Erro de Geolocalização:", error);
            showToast("Não foi possível obter sua localização. O mapa será centralizado no Rio.");
            // Centraliza no Rio como fallback
            appState.lastUserLocation = { latitude: -22.894744, longitude: -43.294099 };
            appState.locationPermissionGranted = false; // Não foi concedida
            
            showPage('map');
            initializeMap(); // Inicializa o mapa

        } finally {
            showLoadingModal(false);
        }
    };
};

const getCurrentLocation = (options = { timeout: 10000, enableHighAccuracy: true }) => {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            return reject(new Error('Geolocalização não suportada.'));
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
};

const initializeMap = () => {
    if (appState.map) { 
        appState.map.invalidateSize();
        return;
    }
    
    // Centraliza no usuário ou no Rio (fallback)
    const initialCoords = [appState.lastUserLocation.latitude, appState.lastUserLocation.longitude];
    
    appState.map = L.map('map-container', { 
        zoomControl: false,
        maxZoom: 20 // ATUALIZAÇÃO: Zoom máximo aumentado
    }).setView(initialCoords, 17); 
    
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 20
    }).addTo(appState.map);
    
    L.control.zoom({ position: 'topright' }).addTo(appState.map);

    // Adiciona o marcador do usuário se a permissão foi dada
    if (appState.locationPermissionGranted && appState.lastUserLocation) {
        appState.userMarker = L.marker(initialCoords)
            .addTo(appState.map)
            .bindPopup("Você está aqui!")
            .openPopup();
    }

    loadTreesOnMap(); // Carrega árvores reais
};

// ATUALIZAÇÃO: Botão de localizar agora re-centraliza
const centerMapOnUserLocation = async () => {
    if (appState.locationPermissionGranted && appState.lastUserLocation) {
        // Se já tem permissão, só re-centraliza
        appState.map.setView([appState.lastUserLocation.latitude, appState.lastUserLocation.longitude], 18);
        if (appState.userMarker) {
            appState.userMarker.setLatLng(appState.lastUserLocation).openPopup();
        }
    } else {
        // Se não tem, pede novamente (como no fluxo inicial)
        promptForLocation();
    }
};

const addTreeMarkerToMap = (tree) => {
    // Converte GeoPoint do Firebase para LatLng do Leaflet
    if (!tree.location || !tree.location.latitude || !tree.location.longitude) {
        console.warn("Árvore sem dados de localização válidos:", tree.id);
        return;
    }
    const latLng = [tree.location.latitude, tree.location.longitude];

    // Evita adicionar marcador duplicado
    if (appState.treeMarkers[tree.id]) {
        appState.treeMarkers[tree.id].setLatLng(latLng); // Atualiza posição se necessário
        return;
    }

    let iconUrl;
    switch (tree.status) {
        case 'healthy': iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'; break;
        case 'needs-care': iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png'; break;
        case 'critical': iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png'; break;
        default: iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png';
    }
    const treeIcon = L.icon({
        iconUrl: iconUrl,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    const marker = L.marker(latLng, { icon: treeIcon });
    marker.treeData = tree; // Guarda os dados completos no marcador

    marker.on('click', () => showTreeProfile(tree.id));
    marker.addTo(appState.map);

    appState.treeMarkers[tree.id] = marker; // Salva referência
};

const loadTreesOnMap = () => {
    // Usamos onSnapshot para carregar árvores em tempo real!
    // Se uma árvore nova for cadastrada, ela aparece "magicamente".
    const q = query(collection(db, "trees"));
    
    onSnapshot(q, (querySnapshot) => {
        console.log("Recebendo atualização das árvores...");
        querySnapshot.forEach((doc) => {
            const tree = { id: doc.id, ...doc.data() };
            addTreeMarkerToMap(tree);
        });
    }, (error) => {
        console.error("Erro ao carregar árvores em tempo real:", error);
        showToast("Erro ao carregar as árvores do mapa.");
    });
};

const showTreeProfile = async (treeId) => {
    showLoadingModal(true, "Carregando árvore...");
    try {
        const docRef = doc(db, "trees", treeId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error("Árvore não encontrada");
        }
        
        appState.currentTree = { id: docSnap.id, ...docSnap.data() };
        const tree = appState.currentTree;

        // Preenche os dados básicos
        document.getElementById('tree-profile-name').textContent = tree.commonName || 'Nome não definido';
        document.getElementById('tree-profile-scientific-name').textContent = tree.scientificName || '';
        document.getElementById('tree-profile-address').querySelector('span').textContent = tree.address || (tree.location ? `${tree.location.latitude.toFixed(5)}, ${tree.location.longitude.toFixed(5)}` : "Localização não disponível");
        document.getElementById('tree-profile-image').src = tree.coverPhoto || 'https://placehold.co/600x300/81C784/FFFFFF?text=Árvore';

        // Atualiza o status visual
        const statusBadge = document.getElementById('tree-profile-status-badge');
        if (tree.status === 'healthy') { statusBadge.className = 'bg-sucesso text-white text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Saudável'; }
        else if (tree.status === 'needs-care') { statusBadge.className = 'bg-alerta text-yellow-800 text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Precisa de Cuidado'; }
        else { statusBadge.className = 'bg-erro text-white text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Em Estado Crítico'; }

        // Carrega o histórico, mural e "adoradores" (em tempo real)
        loadTreeSubcollection(treeId, 'careEvents', 'tree-profile-history', renderHistoryEvent);
        loadTreeSubcollection(treeId, 'careEvents', 'tree-profile-timeline', renderTimelineEvent, true); // 'true' para filtrar por posts com mensagem
        loadTreeSubcollection(treeId, 'adopters', 'tree-profile-adopters', renderAdopter);

        // ATUALIZAÇÃO: Verifica se o usuário já adotou
        checkAdoptionStatus(treeId);

        showPage('tree-profile');

    } catch (error) {
        console.error("Erro ao carregar perfil da árvore:", error);
        showToast("Não foi possível carregar os detalhes desta árvore.");
    } finally {
        showLoadingModal(false);
    }
};

// Função genérica para carregar subcoleções (Histórico, Mural, Adotadores)
const loadTreeSubcollection = (treeId, subcollection, containerId, renderFunction, filterByMessage = false) => {
    const container = document.getElementById(containerId);
    container.innerHTML = `<p class="text-gray-500 text-sm">Carregando...</p>`;

    let q = query(collection(db, "trees", treeId, subcollection));
    
    // Adiciona ordenação para eventos
    if (subcollection === 'careEvents') {
        q = query(q, orderBy("timestamp", "desc"));
    }

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = `<p class="text-gray-500 text-sm text-center italic">Nada por aqui ainda.</p>`;
            return;
        }
        
        container.innerHTML = ''; // Limpa container
        let itemsFound = 0;

        snapshot.forEach(doc => {
            const item = doc.data();
            
            // Filtro para o mural (só mostra se tiver mensagem)
            if (filterByMessage && !item.message) {
                return;
            }
            
            container.innerHTML += renderFunction(item);
            itemsFound++;
        });

        if (itemsFound === 0 && filterByMessage) {
            container.innerHTML = `<p class="text-gray-500 text-sm text-center italic">Nenhuma mensagem no mural.</p>`;
        }
        
        lucide.createIcons();
    }, (error) => {
        console.error(`Erro ao carregar ${subcollection}:`, error);
        container.innerHTML = `<p class="text-erro">Erro ao carregar dados.</p>`;
    });
};

// Funções "render" para a subcoleção
const renderHistoryEvent = (event) => {
    if (!event || !event.user || !event.action) return '';
    const eventDate = event.timestamp ? event.timestamp.toDate().toLocaleDateString('pt-BR') : 'sem data';
    return `<div class="p-1 border-b"><span class="font-semibold">${eventDate}:</span> ${event.user.name || 'Alguém'} ${event.action}</div>`;
};

const renderTimelineEvent = (event) => {
    if (!event || !event.user) return '';
    const eventDate = event.timestamp ? event.timestamp.toDate().toLocaleDateString('pt-BR') : 'sem data';
    const isFirst = event.action.includes("cadastrou");
    return `
        <div class="bg-cinza p-3 rounded-lg fade-in relative">
            <div class="flex items-center mb-2">
                <img src="${event.user.photoURL || 'https://placehold.co/32x32/cccccc/FFFFFF?text=?'}" class="w-8 h-8 rounded-full object-cover">
                <p class="ml-2 font-semibold text-sm">${event.user.name || 'Anônimo'}</p>
                <p class="ml-auto text-xs text-gray-500">${eventDate}</p>
            </div>
            ${event.photoUrl ? `<img src="${event.photoUrl}" class="w-full h-auto rounded-lg object-cover my-2">` : ''}
            <p class="text-sm text-gray-700 italic">"${event.message}"</p>
            ${isFirst ? '<span class="absolute -top-2 -right-2 text-xs bg-alerta text-yellow-800 font-semibold px-2 py-0.5 rounded-full shadow-md">✨ Primeira Mensagem</span>' : ''}
        </div>`;
};

const renderAdopter = (adopter) => {
    if (!adopter) return '';
    return `<span class="bg-verde-claro bg-opacity-50 text-verde-principal text-sm font-semibold px-2 py-1 rounded-full flex items-center gap-1">
                <img src="${adopter.photoURL || 'https://placehold.co/16x16/cccccc/FFFFFF?text=?'}" class="w-4 h-4 rounded-full">
                ${adopter.name || 'Alguém'}
            </span>`;
};


// --- 8. LÓGICA DE "ADOTAR" ÁRVORE ---

const checkAdoptionStatus = async (treeId) => {
    const btn = document.getElementById('btn-adopt-tree');
    const user = appState.currentUser;
    if (!user) return;

    const adoptRef = doc(db, "trees", treeId, "adopters", user.uid);
    const docSnap = await getDoc(adoptRef);

    if (docSnap.exists()) {
        // Usuário JÁ adotou
        btn.classList.replace('text-verde-principal', 'text-erro');
        btn.querySelector('span').textContent = 'Remover Adoção';
        btn.querySelector('i').setAttribute('data-lucide', 'heart-off');
    } else {
        // Usuário NÃO adotou
        btn.classList.replace('text-erro', 'text-verde-principal');
        btn.querySelector('span').textContent = 'Adotar';
        btn.querySelector('i').setAttribute('data-lucide', 'heart');
    }
    lucide.createIcons();
};

const handleAdoptTree = async () => {
    const tree = appState.currentTree;
    const user = appState.currentUser;
    if (!tree || !user) return;

    const btn = document.getElementById('btn-adopt-tree');
    btn.disabled = true; // Previne cliques duplos

    const treeAdoptRef = doc(db, "trees", tree.id, "adopters", user.uid);
    const userAdoptRef = doc(db, "users", user.uid, "adoptedTrees", tree.id);
    
    try {
        const docSnap = await getDoc(treeAdoptRef);
        
        if (docSnap.exists()) {
            // JÁ ADOTOU -> Remover Adoção
            await deleteDoc(treeAdoptRef);
            await deleteDoc(userAdoptRef);
            showToast(`${tree.commonName} removida das suas adoções.`);
        } else {
            // NÃO ADOTOU -> Adotar
            const adoptionData = {
                name: user.name,
                photoURL: user.photoURL,
                adoptedAt: serverTimestamp()
            };
            await setDoc(treeAdoptRef, adoptionData);
            
            // Adiciona no perfil do usuário também
            await setDoc(userAdoptRef, {
                commonName: tree.commonName,
                scientificName: tree.scientificName,
                coverPhoto: tree.coverPhoto || '',
                adoptedAt: serverTimestamp()
            });
            
            showToast(`Você adotou a ${tree.commonName}!`);
            awardPoints('adopt_tree');
        }
        
        checkAdoptionStatus(tree.id); // Atualiza o botão

    } catch (error) {
        console.error("Erro ao adotar/desadotar:", error);
        showToast("Ocorreu um erro.");
    } finally {
        btn.disabled = false;
    }
};


// --- 9. FLUXO DE CUIDADO E CADASTRO ---

const uploadImage = async (file) => {
    if (!file) return null;
    
    // ATENÇÃO: Verifique se as regras do Storage permitem esta pasta
    const filePath = `photos/${Date.now()}_${file.name}`; 
    const fileRef = ref(storage, filePath);
    
    try {
        showLoadingModal(true, "Enviando foto...");
        const snapshot = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(snapshot.ref);
        console.log("Foto enviada com sucesso:", url);
        return url;
    } catch (error) {
        console.error("Erro no upload da imagem:", error);
        showToast("Erro ao enviar a foto. Tente novamente.");
        return null;
    } finally {
        showLoadingModal(false); // Garante que o modal de loading da foto feche
    }
};

const handleFinishCare = async () => {
    const tree = appState.currentTree;
    const user = appState.currentUser;
    if (!tree || !user) return;

    showLoadingModal(true, "Registrando seu cuidado...");
    const message = document.getElementById('care-message').value;
    const photoFile = document.getElementById('care-photo-input').files[0];
    
    try {
        // Faz o upload da foto ANTES de registrar no Firestore
        const photoUrl = await uploadImage(photoFile);
        
        const careEvent = {
            action: "cuidou da planta.", // TODO: Ser mais específico (regar, limpar)
            message: message || '',
            photoUrl: photoUrl || null,
            user: { 
                id: user.uid, 
                name: user.name, 
                photoURL: user.photoURL 
            },
            timestamp: serverTimestamp()
        };
        
        const eventsCollectionRef = collection(db, "trees", tree.id, "careEvents");
        await addDoc(eventsCollectionRef, careEvent);
        
        awardPoints('care_tree');
        showToast("Cuidado registrado com sucesso! 🌳");
        showPage('tree-profile'); // Volta para o perfil da árvore
        
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
    feedContainer.innerHTML = '<p class="text-center text-gray-500">Carregando o feed da galera...</p>';
    
    try {
        // collectionGroup 'careEvents' busca em *todas* as subcoleções 'careEvents' de *todas* as árvores.
        const q = query(
            collectionGroup(db, 'careEvents'), 
            orderBy('timestamp', 'desc'), 
            limit(15)
        );
        
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            feedContainer.innerHTML = `<p class="text-center text-gray-500 italic">O feed está quieto... Seja o primeiro a cuidar de uma árvore!</p>`;
            return;
        }

        feedContainer.innerHTML = ''; // Limpa a mensagem de "carregando"
        
        snapshot.forEach(doc => {
            const event = doc.data();
            // Só mostra no feed se tiver foto OU mensagem
            if (event.photoUrl || event.message) {
                feedContainer.innerHTML += renderTimelineEvent(event); // Reutiliza a função de render
            }
        });

    } catch (error) {
        console.error("Não foi possível carregar o feed:", error);
        feedContainer.innerHTML = `<p class="text-erro text-center">Erro ao carregar o feed.</p>`;
    }
};


// --- 10. FLUXO DE IDENTIFICAÇÃO E CÂMERA ---

// ATUALIZAÇÃO: Pede acesso à câmera
const requestCameraAccess = async () => {
    const videoEl = document.getElementById('camera-feed');
    const placeholder = document.getElementById('camera-placeholder');
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } // Pede a câmera traseira
            });
            videoEl.srcObject = stream;
            videoEl.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } catch (error) {
            console.error("Erro ao acessar a câmera:", error);
            placeholder.querySelector('p').textContent = 'Erro ao acessar a câmera. Use o botão de galeria.';
            showToast("Não foi possível acessar a câmera.");
        }
    } else {
        placeholder.querySelector('p').textContent = 'Câmera não suportada. Use o botão de galeria.';
    }
};

// ATUALIZAÇÃO: Captura da foto pela tag <video>
const capturePhotoFromFeed = () => {
    const video = document.getElementById('camera-feed');
    if (!video.srcObject) {
        showToast("Câmera não está ativa.");
        return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Converte o canvas para um Blob (arquivo)
    canvas.toBlob((blob) => {
        if (blob) {
            handlePlantIdentification(blob);
        }
    }, 'image/jpeg', 0.95); // 95% de qualidade
};


const handlePlantIdentification = async (file) => {
    if (!file) return;

    const resultImageEl = document.getElementById('result-plant-image');
    resultImageEl.src = URL.createObjectURL(file); // Mostra preview da foto tirada/escolhida
    showPage('result');
    showLoadingModal(true, "Identificando a planta...");

    const formData = new FormData();
    formData.append('images', file);
    
    try {
        // Usa o caminho relativo para a função Netlify (como no seu código beta)
        const response = await fetch('/.netlify/functions/identify', { 
            method: 'POST', 
            body: formData 
        }); 
        
        if (!response.ok) {
            let errorData;
            try { errorData = await response.json(); } catch (e) { /* Ignora erro no json */ }
            throw new Error(`Erro do servidor: ${response.status} - ${errorData?.error || response.statusText}`);
        }
        
        const data = await response.json();
        const bestMatch = data.results?.[0];

        if (bestMatch && bestMatch.score > 0.2) { // Só aceita se tiver mais de 20%
            appState.currentPlantInfo = {
                commonName: bestMatch.species.commonNames?.[0] || bestMatch.species.scientificNameWithoutAuthor.split(' ')[0], // Usa o primeiro nome científico como fallback
                scientificName: bestMatch.species.scientificNameWithoutAuthor,
                score: bestMatch.score
            };
            document.getElementById('result-common-name').textContent = appState.currentPlantInfo.commonName;
            document.getElementById('result-scientific-name').textContent = appState.currentPlantInfo.scientificName;
            const confidence = Math.round(appState.currentPlantInfo.score * 100);
            document.getElementById('result-confidence').textContent = `${confidence}%`;
            document.getElementById('result-confidence-bar').style.width = `${confidence}%`;
        } else {
            appState.currentPlantInfo = null;
            document.getElementById('result-common-name').textContent = "Identificação incerta";
            document.getElementById('result-scientific-name').textContent = "Tente uma foto com melhor iluminação.";
            document.getElementById('result-confidence').textContent = `0%`;
            document.getElementById('result-confidence-bar').style.width = `0%`;
            showToast(data.message || "Não foi possível identificar a planta.");
        }
    } catch (error) {
        console.error("Falha na chamada da Netlify Function:", error);
        appState.currentPlantInfo = null;
        document.getElementById('result-common-name').textContent = "Erro na identificação";
        document.getElementById('result-scientific-name').textContent = "Verifique sua conexão.";
        document.getElementById('result-confidence').textContent = `0%`;
        document.getElementById('result-confidence-bar').style.width = `0%`;
        showToast("Não foi possível conectar ao sistema de identificação."); 
    } finally {
        showLoadingModal(false);
    }
};

const initiateCareFlow = async () => {
    if (!appState.currentPlantInfo) {
        showToast("Erro: Nenhuma planta identificada.");
        return;
    }
    
    awardPoints('identify_tree'); 
    
    // Lógica para verificar se a árvore existe
    // Por enquanto, vamos assumir que não existe para mostrar o fluxo de cadastro
    const treeExists = false; 
    // TODO: Implementar busca por localização + espécie
    // const existingTree = await findTreeNearby(appState.currentPlantInfo.scientificName, appState.lastUserLocation);

    if (treeExists) {
        // Mostra a tela de cuidado normal
        // appState.currentTree = existingTree; // Define a árvore encontrada
        // ... (código para mostrar cuidado normal)
    } else {
        // Mostra a tela de cuidado adaptada para cadastro
        showPage('care');
        document.getElementById('care-title').textContent = "Árvore não cadastrada!";
        document.getElementById('care-subtitle').textContent = `Gostaria de adicionar esta ${appState.currentPlantInfo.commonName} ao mapa?`;
        document.getElementById('care-actions-container').classList.add('hidden'); // Esconde ações
        document.getElementById('add-tree-button-container').classList.remove('hidden'); // Mostra botão de cadastrar
    }
};

const handleRegisterNewTree = async () => {
    if (!appState.currentPlantInfo || !appState.lastUserLocation) {
        showToast("Localização exata necessária. Tente se localizar no mapa primeiro.");
        return;
    }
    showLoadingModal(true, "Cadastrando nova árvore...");

    const health = document.getElementById('add-tree-health').value;
    const message = document.getElementById('add-tree-message').value;
    const photoFile = document.getElementById('add-tree-photo-input').files[0];

    try {
        const photoUrl = await uploadImage(photoFile); // Upload da foto da árvore
        
        const newTree = {
            commonName: appState.currentPlantInfo.commonName,
            scientificName: appState.currentPlantInfo.scientificName,
            status: health,
            location: new GeoPoint(appState.lastUserLocation.latitude, appState.lastUserLocation.longitude),
            coverPhoto: photoUrl || 'https://placehold.co/600x300/81C784/FFFFFF?text=🌳',
            createdAt: serverTimestamp(),
            createdBy: {
                uid: appState.currentUser.uid,
                name: appState.currentUser.name
            }
        };
        
        const docRef = await addDoc(collection(db, "trees"), newTree);
        
        // Adiciona a primeira mensagem (se houver)
        if (message || photoUrl) {
            const firstMessage = {
                action: "cadastrou esta árvore.",
                message: message || "Adicionei esta nova amiga!",
                user: { 
                    id: appState.currentUser.uid, 
                    name: appState.currentUser.name, 
                    photoURL: appState.currentUser.photoURL 
                },
                timestamp: serverTimestamp(),
                photoUrl: photoUrl // Usa a mesma foto do cadastro
            };
            await addDoc(collection(db, "trees", docRef.id, "careEvents"), firstMessage);
        }
        
        awardPoints('add_tree');
        // O onSnapshot do mapa vai cuidar de adicionar o marcador
        showToast("Árvore cadastrada com sucesso!");
        
        showPage('map'); // Volta para o mapa
        
        // Limpa a tela de cadastro
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


// --- 11. SABER MAIS (Curadoria) ---
const curatedContent = {
    "Como melhorar a terra do canteiro?": { intro: "A @erika.canton tem uma dica de ouro...", title: "Adubação Power...", creator: "@erika.canton", url: "https://www.instagram.com/p/DO-4c94Dd6J/" },
    "Por que não pode pintar os troncos das árvores?": { intro: "O mestre @ricardo__cardim explica...", title: "Tronco não é parede!", creator: "@ricardo__cardim", url: "https://www.instagram.com/p/DOt6dqtjkmp/" },
    "Como proteger uma árvore jovem?": { intro: "Proteger as árvores mais novas é fundamental...", title: "Cuidando do futuro", creator: "@ricardo__cardim", url: "https://www.instagram.com/p/DOt6dqtjkmp/" }
};
const handleLearnSearch = (query) => {
    if (!query) return;
    const resultsContainer = document.getElementById('learn-results-container');
    resultsContainer.innerHTML = '';
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
        resultsContainer.innerHTML = `<p class="text-center text-gray-600">O Arvoreco ainda está aprendendo sobre "${query}". Tente uma das sugestões!</p>`;
    }
};


// --- 12. HELPERS E EVENT LISTENERS ---

// Ajusta a altura da app para mobile
const setAppHeight = () => {
    const doc = document.documentElement;
    doc.style.setProperty('--app-height', `${window.innerHeight}px`);
};

// Centraliza todos os listeners de eventos
const setupEventListeners = () => {
    // Navegação Principal (botões data-page)
    document.body.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.nav-btn, .nav-to-btn');
        if (navBtn && navBtn.dataset.page) { 
            e.preventDefault();
            showPage(navBtn.dataset.page);
        }
    });

    // Forms de Autenticação
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // Identificação (Upload de Galeria)
    document.getElementById('plant-photo-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handlePlantIdentification(e.target.files[0]);
        }
    });
    
    // Identificação (Captura da Câmera)
    document.getElementById('btn-capture').addEventListener('click', capturePhotoFromFeed);

    // Fluxo de Resultado
    document.getElementById('btn-confirm-no').addEventListener('click', () => {
        showToast("Tente tirar uma foto de outro ângulo.");
        document.getElementById('plant-photo-input').value = null;
        showPage('camera');
    });
    document.getElementById('btn-initiate-care').addEventListener('click', initiateCareFlow);

    // Fluxo de Cadastro
    document.getElementById('btn-finish-add-tree').addEventListener('click', handleRegisterNewTree);
    document.getElementById('add-tree-photo-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const preview = document.getElementById('add-tree-photo-preview');
            preview.src = URL.createObjectURL(e.target.files[0]);
            preview.classList.remove('hidden');
        }
    });

    // Mapa
    document.getElementById('btn-locate-me').addEventListener('click', centerMapOnUserLocation);

    // Fluxo de Cuidado
    document.getElementById('btn-finish-care').addEventListener('click', handleFinishCare);
    document.querySelectorAll('.care-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Se for o link da prefeitura, deixa continuar
            if (e.currentTarget.id === 'action-prune') return; 
            
            if (!btn.disabled) {
                document.getElementById('care-confirmation-section').classList.remove('hidden');
                // TODO: Salvar qual ação foi (regar/limpar)
            }
        });
    });

    // Perfil da Árvore
    document.getElementById('btn-care-from-profile').addEventListener('click', () => {
        if (appState.currentTree) {
            showPage('care');
            document.getElementById('care-title').textContent = appState.currentTree.commonName;
            document.getElementById('care-subtitle').textContent = "O que esta belezura precisa hoje?";
            document.getElementById('care-actions-container').classList.remove('hidden');
            document.getElementById('add-tree-button-container').classList.add('hidden');
            // Habilita botões
            document.getElementById('action-water').disabled = false;
            document.getElementById('action-clean').disabled = false;
            document.getElementById('action-water').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('action-clean').classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
    document.getElementById('btn-adopt-tree').addEventListener('click', handleAdoptTree);


    // Aba "Saber Mais"
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

    // Modais
    document.getElementById('btn-show-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
    document.getElementById('btn-close-help-modal').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
};

// --- INICIALIZA A APLICAÇÃO ---
// Adiciona o listener para rodar o código quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializeAppCore);