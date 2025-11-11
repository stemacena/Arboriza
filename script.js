// MUDANÇAS: Adicionada lógica de upload de avatar e postagem de comentário.
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
    onSnapshot, 
    orderBy,
    limit,
    collectionGroup,
    serverTimestamp,
    GeoPoint,
    updateDoc,
    deleteDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- 1. CONFIGURAÇÃO E INICIALIZAÇÃO ---
const firebaseConfig = {
    apiKey: "AIzaSyDz5FUlrXC07aQDMJ4XzomdT4gkyKZVKgg",
    authDomain: "arboriza-bd.firebaseapp.com",
    projectId: "arboriza-bd",
    storageBucket: "arboriza-bd.firebasestorage.app",
    messagingSenderId: "210425976523",
    appId: "1:210425976523:web:2733f5b67fe02aa7d4ad4e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- 2. ESTADO GLOBAL DA APLICAÇÃO ---
const appState = {
    currentUser: null,
    currentTree: null,
    currentPlantInfo: null,
    lastUserLocation: null,
    locationPermissionGranted: false,
    map: null,
    userMarker: null,
    treeMarkers: {}
};

// --- 3. FUNÇÕES PRINCIPAIS (Ciclo de Vida da App) ---

const initializeAppCore = () => {
    console.log("Arboriza 1.0.3 iniciando...");
    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    lucide.createIcons();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Usuário logado:", user.uid);
            fetchUserProfile(user.uid);
        } else {
            console.log("Nenhum usuário logado.");
            appState.currentUser = null;
            showPage('onboarding');
            document.querySelector('main').classList.add('hidden');
            document.querySelector('nav').classList.add('hidden');
        }
    });

    setupEventListeners();
};

const fetchUserProfile = async (uid) => {
    showLoadingModal(true, "Carregando seu perfil...");
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        appState.currentUser = { uid: uid, ...userSnap.data() };
        console.log("Perfil do usuário carregado:", appState.currentUser);
        
        document.querySelector('main').classList.remove('hidden');
        document.querySelector('nav').classList.remove('hidden');
        
        promptForLocation(); 

    } else {
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
        showPage('map');
        return;
    }

    const authPages = ['onboarding', 'login', 'signup'];
    const nav = document.querySelector('nav');
    if (nav) {
        nav.style.display = authPages.includes(pageId) ? 'none' : 'flex';
    }

    updateNavButtons(pageId);

    if (pageId === 'map') {
        setTimeout(() => {
            if (appState.map) appState.map.invalidateSize();
        }, 10);
    }
    if (pageId === 'feed') loadFeedPosts();
    if (pageId === 'profile' || pageId === 'achievements') updateGamificationUI();
    if (pageId === 'camera') requestCameraAccess();
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
        appState.map = null;
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
        case 'auth/configuration-not-found':
             return 'Configuração de login não encontrada. (Ative Email/Senha no Firebase).';
        default:
            return 'Ocorreu um erro. Tente novamente.';
    }
};


// --- 6. GAMIFICAÇÃO E PERFIL ---

// NOVO: Função de Upload de Foto de Perfil
const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !appState.currentUser) return;

    showLoadingModal(true, "Atualizando sua foto...");
    
    try {
        // 1. Caminho seguro no Storage
        const filePath = `user-avatars/${appState.currentUser.uid}/avatar.jpg`;
        const fileRef = ref(storage, filePath);
        
        // 2. Faz o upload
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // 3. Atualiza o documento do usuário no Firestore
        const userRef = doc(db, "users", appState.currentUser.uid);
        await updateDoc(userRef, {
            photoURL: downloadURL
        });
        
        // 4. Atualiza o estado local e a UI
        appState.currentUser.photoURL = downloadURL;
        document.getElementById('profile-avatar').src = downloadURL;
        
        showToast("Foto de perfil atualizada!");

    } catch (error) {
        console.error("Erro ao atualizar foto de perfil:", error);
        showToast("Erro ao enviar sua foto.");
    } finally {
        showLoadingModal(false);
    }
};


const awardPoints = async (action) => {
    if (!appState.currentUser) return;

    let points = 0;
    let newStats = { ...appState.currentUser };

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
            points = 10;
            newStats.treesIdentified = (newStats.treesIdentified || 0) + 1;
            break;
        case 'adopt_tree':
            points = 20;
            break;
        case 'comment_tree':
            points = 5; // Dá 5 pontos por um comentário
            break;
    }

    if (points > 0) {
        newStats.points = (newStats.points || 0) + points;
        showToast(`Você ganhou ${points} pontos!`);
        
        appState.currentUser = newStats;
        
        const userRef = doc(db, "users", appState.currentUser.uid);
        try {
            // Atualiza apenas os campos que mudam
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

    document.getElementById('profile-name').textContent = user.name || 'Guardião';
    document.getElementById('profile-avatar').src = user.photoURL || `https://placehold.co/128x128/cccccc/FFFFFF?text=${user.name.charAt(0)}`;
    document.getElementById('profile-level').textContent = user.levelName || 'Nível 1: Semente';
    
    const pointsToLevelUp = 1000;
    const currentPoints = Number(user.points) || 0; 
    const progress = Math.min((currentPoints / pointsToLevelUp) * 100, 100);

    document.getElementById('profile-points-text').textContent = currentPoints;
    document.getElementById('profile-progress-bar').style.width = `${progress}%`;
    document.getElementById('profile-progress-text').textContent = `${Math.round(progress)}%`;
    document.getElementById('profile-stat-cared').textContent = `🌳 ${user.treesCared || 0}`;
    document.getElementById('profile-stat-identified').textContent = `🌿 ${user.treesIdentified || 0}`;
    document.getElementById('profile-stat-added').textContent = `📍 ${user.treesAdded || 0}`;
    
    loadAdoptedTreesForProfile();

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
        
        listEl.innerHTML = '';
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

const promptForLocation = () => {
    if (appState.locationPermissionGranted) {
        console.log("Permissão de localização já concedida.");
        showPage('map');
        initializeMap();
        centerMapOnUserLocation();
        return;
    }

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
            initializeMap();

        } catch (error) {
            console.error("Erro de Geolocalização:", error);
            showToast("Não foi possível obter sua localização. O mapa será centralizado no Rio.");
            appState.lastUserLocation = { latitude: -22.894744, longitude: -43.294099 };
            appState.locationPermissionGranted = false;
            
            showPage('map');
            initializeMap();

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
    
    const initialCoords = [appState.lastUserLocation.latitude, appState.lastUserLocation.longitude];
    
    appState.map = L.map('map-container', { 
        zoomControl: false,
        maxZoom: 20
    }).setView(initialCoords, 17); 
    
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 20
    }).addTo(appState.map);
    
    L.control.zoom({ position: 'topright' }).addTo(appState.map);

    if (appState.locationPermissionGranted && appState.lastUserLocation) {
        appState.userMarker = L.marker(initialCoords)
            .addTo(appState.map)
            .bindPopup("Você está aqui!")
            .openPopup();
    }

    loadTreesOnMap();
};

const centerMapOnUserLocation = async () => {
    if (appState.locationPermissionGranted && appState.lastUserLocation) {
        appState.map.setView([appState.lastUserLocation.latitude, appState.lastUserLocation.longitude], 18);
        if (appState.userMarker) {
            appState.userMarker.setLatLng(appState.lastUserLocation).openPopup();
        }
    } else {
        promptForLocation();
    }
};

const addTreeMarkerToMap = (tree) => {
    if (!tree.location || !tree.location.latitude || !tree.location.longitude) {
        console.warn("Árvore sem dados de localização válidos:", tree.id);
        return;
    }
    const latLng = [tree.location.latitude, tree.location.longitude];

    if (appState.treeMarkers[tree.id]) {
        appState.treeMarkers[tree.id].setLatLng(latLng);
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
    marker.treeData = tree;

    marker.on('click', () => showTreeProfile(tree.id));
    marker.addTo(appState.map);

    appState.treeMarkers[tree.id] = marker;
};

const loadTreesOnMap = () => {
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

        document.getElementById('tree-profile-name').textContent = tree.commonName || 'Nome não definido';
        document.getElementById('tree-profile-scientific-name').textContent = tree.scientificName || '';
        document.getElementById('tree-profile-address').querySelector('span').textContent = tree.address || (tree.location ? `${tree.location.latitude.toFixed(5)}, ${tree.location.longitude.toFixed(5)}` : "Localização não disponível");
        document.getElementById('tree-profile-image').src = tree.coverPhoto || 'https://placehold.co/600x300/81C784/FFFFFF?text=Árvore';

        const statusBadge = document.getElementById('tree-profile-status-badge');
        if (tree.status === 'healthy') { statusBadge.className = 'bg-sucesso text-white text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Saudável'; }
        else if (tree.status === 'needs-care') { statusBadge.className = 'bg-alerta text-yellow-800 text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Precisa de Cuidado'; }
        else { statusBadge.className = 'bg-erro text-white text-center font-bold p-2 rounded-lg my-4'; statusBadge.textContent = 'Em Estado Crítico'; }

        loadTreeSubcollection(treeId, 'careEvents', 'tree-profile-history', renderHistoryEvent);
        loadTreeSubcollection(treeId, 'careEvents', 'tree-profile-timeline', renderTimelineEvent, true);
        loadTreeSubcollection(treeId, 'adopters', 'tree-profile-adopters', renderAdopter);

        checkAdoptionStatus(treeId);

        showPage('tree-profile');

    } catch (error) {
        console.error("Erro ao carregar perfil da árvore:", error);
        showToast("Não foi possível carregar os detalhes desta árvore.");
    } finally {
        showLoadingModal(false);
    }
};

const loadTreeSubcollection = (treeId, subcollection, containerId, renderFunction, filterByMessage = false) => {
    const container = document.getElementById(containerId);
    container.innerHTML = `<p class="text-gray-500 text-sm">Carregando...</p>`;

    let q = query(collection(db, "trees", treeId, subcollection));
    
    if (subcollection === 'careEvents') {
        q = query(q, orderBy("timestamp", "desc"));
    }

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = `<p class="text-gray-500 text-sm text-center italic">Nada por aqui ainda.</p>`;
            return;
        }
        
        container.innerHTML = '';
        let itemsFound = 0;

        snapshot.forEach(doc => {
            const item = doc.data();
            
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


// --- 8. LÓGICA DE "ADOTAR" E "COMENTAR" ---

const checkAdoptionStatus = async (treeId) => {
    const btn = document.getElementById('btn-adopt-tree');
    const user = appState.currentUser;
    if (!user || !btn) return; 

    const adoptRef = doc(db, "trees", treeId, "adopters", user.uid);
    const docSnap = await getDoc(adoptRef);

    if (docSnap.exists()) {
        btn.classList.replace('text-verde-principal', 'text-erro');
        btn.innerHTML = `
            <i data-lucide="heart-off" class="w-5 h-5"></i>
            <span>Remover Adoção</span>
        `;
    } else {
        btn.classList.replace('text-erro', 'text-verde-principal');
        btn.innerHTML = `
            <i data-lucide="heart" class="w-5 h-5"></i>
            <span>Adotar</span>
        `;
    }
    lucide.createIcons();
};

const handleAdoptTree = async () => {
    const tree = appState.currentTree;
    const user = appState.currentUser;
    if (!tree || !user) return;

    const btn = document.getElementById('btn-adopt-tree');
    btn.disabled = true;

    const treeAdoptRef = doc(db, "trees", tree.id, "adopters", user.uid);
    const userAdoptRef = doc(db, "users", user.uid, "adoptedTrees", tree.id);
    
    try {
        const docSnap = await getDoc(treeAdoptRef);
        
        if (docSnap.exists()) {
            await deleteDoc(treeAdoptRef);
            await deleteDoc(userAdoptRef);
            showToast(`${tree.commonName} removida das suas adoções.`);
        } else {
            const adoptionData = {
                name: user.name,
                photoURL: user.photoURL,
                adoptedAt: serverTimestamp()
            };
            await setDoc(treeAdoptRef, adoptionData);
            
            await setDoc(userAdoptRef, {
                commonName: tree.commonName,
                scientificName: tree.scientificName,
                coverPhoto: tree.coverPhoto || '',
                adoptedAt: serverTimestamp()
            });
            
            showToast(`Você adotou a ${tree.commonName}!`);
            awardPoints('adopt_tree');
        }
        
        checkAdoptionStatus(tree.id);

    } catch (error) {
        console.error("Erro ao adotar/desadotar:", error);
        showToast("Ocorreu um erro.");
    } finally {
        btn.disabled = false;
    }
};

// NOVO: Função para postar comentário rápido
const handlePostComment = async () => {
    const tree = appState.currentTree;
    const user = appState.currentUser;
    const input = document.getElementById('tree-comment-input');
    const message = input.value;

    if (!tree || !user || !message) {
        showToast("Escreva uma mensagem primeiro!");
        return;
    }
    
    const btn = document.getElementById('btn-post-comment');
    btn.disabled = true;

    try {
        const commentEvent = {
            action: "comentou.", // Ação diferente de "cuidou"
            message: message,
            photoUrl: null, // Sem foto para um comentário rápido
            user: { 
                id: user.uid, 
                name: user.name, 
                photoURL: user.photoURL 
            },
            timestamp: serverTimestamp()
        };
        
        const eventsCollectionRef = collection(db, "trees", tree.id, "careEvents");
        await addDoc(eventsCollectionRef, commentEvent);
        
        awardPoints('comment_tree'); // Dá pontos por comentar
        input.value = ''; // Limpa o campo
        showToast("Mensagem postada no mural!");

    } catch (error) {
        console.error("Erro ao postar comentário:", error);
        showToast("Erro ao enviar sua mensagem.");
    } finally {
        btn.disabled = false;
    }
};


// --- 9. FLUXO DE CUIDADO E CADASTRO ---

// Esta função é para fotos de CUIDADO e de ÁRVORE (pasta /photos/)
const uploadImage = async (file) => {
    if (!file) return null;
    
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
        showLoadingModal(false);
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
        // A função 'uploadImage' já funciona para isso!
        const photoUrl = await uploadImage(photoFile);
        
        const careEvent = {
            action: "cuidou da planta.",
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
        showPage('tree-profile');
        
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

        feedContainer.innerHTML = '';
        
        snapshot.forEach(doc => {
            const event = doc.data();
            if (event.photoUrl || event.message) {
                feedContainer.innerHTML += renderTimelineEvent(event);
            }
        });

    } catch (error) {
        console.error("Não foi possível carregar o feed:", error);
        feedContainer.innerHTML = `<p class="text-erro text-center">Erro ao carregar o feed.</p>`;
    }
};


// --- 10. FLUXO DE IDENTIFICAÇÃO E CÂMERA ---

const requestCameraAccess = async () => {
    const videoEl = document.getElementById('camera-feed');
    const placeholder = document.getElementById('camera-placeholder');
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' }
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
    
    canvas.toBlob((blob) => {
        if (blob) {
            handlePlantIdentification(blob);
        }
    }, 'image/jpeg', 0.95);
};


const handlePlantIdentification = async (file) => {
    if (!file) return;

    const resultImageEl = document.getElementById('result-plant-image');
    resultImageEl.src = URL.createObjectURL(file);
    showPage('result');
    showLoadingModal(true, "Identificando a planta...");

    const formData = new FormData();
    formData.append('images', file);
    
    try {
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

        if (bestMatch && bestMatch.score > 0.2) {
            appState.currentPlantInfo = {
                commonName: bestMatch.species.commonNames?.[0] || bestMatch.species.scientificNameWithoutAuthor.split(' ')[0],
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
        showToast(error.message);
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
    
    const treeExists = false; 

    if (treeExists) {
        // Lógica futura
    } else {
        showPage('care');
        document.getElementById('care-title').textContent = "Árvore não cadastrada!";
        document.getElementById('care-subtitle').textContent = `Gostaria de adicionar esta ${appState.currentPlantInfo.commonName} ao mapa?`;
        document.getElementById('care-actions-container').classList.add('hidden');
        document.getElementById('add-tree-button-container').classList.remove('hidden');
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
        // A função 'uploadImage' já funciona para isso!
        const photoUrl = await uploadImage(photoFile);
        
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
                photoUrl: photoUrl
            };
            await addDoc(collection(db, "trees", docRef.id, "careEvents"), firstMessage);
        }
        
        awardPoints('add_tree');
        showToast("Árvore cadastrada com sucesso!");
        
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

const setAppHeight = () => {
    const doc = document.documentElement;
    doc.style.setProperty('--app-height', `${window.innerHeight}px`);
};

const setupEventListeners = () => {
    document.body.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.nav-btn, .nav-to-btn');
        if (navBtn && navBtn.dataset.page) { 
            e.preventDefault();
            showPage(navBtn.dataset.page);
        }
    });

    // Autenticação
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // NOVO: Perfil
    document.getElementById('profile-avatar-input').addEventListener('change', handleProfilePicUpload);

    // Identificação
    document.getElementById('plant-photo-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handlePlantIdentification(e.target.files[0]);
        }
    });
    document.getElementById('btn-capture').addEventListener('click', capturePhotoFromFeed);
    document.getElementById('btn-confirm-no').addEventListener('click', () => {
        showToast("Tente tirar uma foto de outro ângulo.");
        document.getElementById('plant-photo-input').value = null;
        showPage('camera');
    });
    document.getElementById('btn-initiate-care').addEventListener('click', initiateCareFlow);

    // Cadastro
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

    // Cuidado
    document.getElementById('btn-finish-care').addEventListener('click', handleFinishCare);
    document.querySelectorAll('.care-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.id === 'action-prune') return; 
            
            if (!btn.disabled) {
                document.getElementById('care-confirmation-section').classList.remove('hidden');
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
            document.getElementById('action-water').disabled = false;
            document.getElementById('action-clean').disabled = false;
            document.getElementById('action-water').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('action-clean').classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
    document.getElementById('btn-adopt-tree').addEventListener('click', handleAdoptTree);
    // NOVO: Comentário Rápido
    document.getElementById('btn-post-comment').addEventListener('click', handlePostComment);


    // Saber Mais
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
document.addEventListener('DOMContentLoaded', initializeAppCore);