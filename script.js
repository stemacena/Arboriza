import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail
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
    locationAccuracy: null, // Novo: Guarda a precisão do GPS
    locationWatcherId: null, // Novo: ID do rastreador
    locationPermissionGranted: false,
    map: null,
    userMarker: null,
    treeMarkers: {}
};

// --- 3. FUNÇÕES PRINCIPAIS (Ciclo de Vida da App) ---

const initializeAppCore = () => {
    console.log("Arboriza 1.0.14 iniciando... (Versão Completa + GPS Blindado)"); 
    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    lucide.createIcons();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Usuário logado:", user.uid);
            fetchUserProfile(user.uid, user);
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

const fetchUserProfile = async (uid, authUser) => {
    showLoadingModal(true, "Carregando seu perfil...");
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            appState.currentUser = { uid: uid, ...userSnap.data() };
            console.log("Perfil carregado.");
        } else if (authUser) {
            console.log("Criando novo perfil...");
            const newUserProfile = {
                name: authUser.displayName || "Guardião Anônimo",
                email: authUser.email,
                photoURL: authUser.photoURL || `https://placehold.co/128x128/cccccc/FFFFFF?text=${(authUser.displayName || 'A').charAt(0)}`,
                level: 1,
                levelName: "Semente",
                points: 0,
                treesCared: 0,
                treesIdentified: 0,
                treesAdded: 0,
                createdAt: serverTimestamp()
            };
            await setDoc(userRef, newUserProfile);
            appState.currentUser = { uid: uid, ...newUserProfile };
        } else {
            handleLogout();
            showLoadingModal(false);
            return;
        }
        
        document.querySelector('main').classList.remove('hidden');
        document.querySelector('nav').classList.remove('hidden');
        updateGamificationUI();
        
        // Inicia GPS assim que loga
        startLocationWatcher(); 
        
    } catch (error) {
        console.error("Erro perfil:", error);
        showToast("Erro de conexão.");
    } finally {
        showLoadingModal(false);
    }
};

// --- 4. LÓGICA DE NAVEGAÇÃO E UI ---
const screens = document.querySelectorAll('#app-container > div[id^="screen-"], main > div[id^="screen-"]');
const navButtons = document.querySelectorAll('.nav-btn');
const loadingModal = document.getElementById('loading-modal');
const loadingMessage = document.getElementById('loading-message');

const showPage = (pageId) => {
    const publicPages = ['onboarding', 'login', 'signup'];
    if (!appState.currentUser && !publicPages.includes(pageId)) {
        showPage('login');
        return;
    }

    screens.forEach(screen => screen.classList.add('hidden'));
    const activeScreen = document.getElementById(`screen-${pageId}`);
    
    if (activeScreen) {
        activeScreen.classList.remove('hidden');
    } else {
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
            centerMapOnUserLocation();
        }, 100);
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
    if (toast) {
        toast.querySelector('p').textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 4000);
    }
};

// --- 5. LÓGICA DE AUTENTICAÇÃO ---

const handleSignup = async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const errorMessageEl = document.getElementById('signup-error-message');

    if (name.length < 3) { errorMessageEl.textContent = "Nome muito curto."; errorMessageEl.classList.remove('hidden'); return; }
    showLoadingModal(true, "Criando conta...");
    errorMessageEl.classList.add('hidden');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userRef = doc(db, "users", user.uid);
        const newUserProfile = {
            name: name, email: email,
            photoURL: `https://placehold.co/128x128/cccccc/FFFFFF?text=${name.charAt(0)}`,
            level: 1, levelName: "Semente", points: 0, treesCared: 0, treesIdentified: 0, treesAdded: 0,
            createdAt: serverTimestamp()
        };
        await setDoc(userRef, newUserProfile);
        appState.currentUser = { uid: user.uid, ...newUserProfile };
        startLocationWatcher();
        showPage('map');
    } catch (error) {
        errorMessageEl.textContent = getFirebaseErrorMessage(error);
        errorMessageEl.classList.remove('hidden');
    } finally { showLoadingModal(false); }
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
    } catch (error) {
        errorMessageEl.textContent = getFirebaseErrorMessage(error);
        errorMessageEl.classList.remove('hidden');
    } finally { showLoadingModal(false); }
};

const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    showLoadingModal(true, "Conectando Google...");
    try { await signInWithPopup(auth, provider); } catch (error) { showToast(getFirebaseErrorMessage(error)); } finally { showLoadingModal(false); }
};

const handleForgotPassword = async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    showLoadingModal(true, "Enviando...");
    try {
        await sendPasswordResetEmail(auth, email);
        document.getElementById('forgot-password-modal').classList.add('hidden');
        showToast("Link enviado!");
    } catch (error) { showToast(getFirebaseErrorMessage(error)); } finally { showLoadingModal(false); }
};

const handleLogout = async () => {
    try { await signOut(auth); } catch (error) { showToast("Erro ao sair."); }
};

const getFirebaseErrorMessage = (error) => {
    switch (error.code) {
        case 'auth/email-already-in-use': return 'Email já cadastrado.';
        case 'auth/invalid-email': return 'Email inválido.';
        case 'auth/weak-password': return 'Senha fraca (min 6 carac.).';
        case 'auth/user-not-found': case 'auth/wrong-password': case 'auth/invalid-credential': return 'Login incorreto.';
        default: return 'Ocorreu um erro. Tente novamente.';
    }
};

// --- 6. GAMIFICAÇÃO E PERFIL ---

const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !appState.currentUser) return;
    showLoadingModal(true, "Enviando foto...");
    try {
        const url = await uploadImage(file, `user-avatars/${appState.currentUser.uid}`);
        await updateDoc(doc(db, "users", appState.currentUser.uid), { photoURL: url });
        appState.currentUser.photoURL = url;
        document.getElementById('profile-avatar').src = url;
        showToast("Foto atualizada!");
    } catch (error) { showToast("Erro ao enviar foto."); } finally { showLoadingModal(false); }
};

const awardPoints = async (action) => {
    if (!appState.currentUser) return;
    let points = 0;
    let newStats = { ...appState.currentUser };
    switch (action) {
        case 'add_tree': points = 100; newStats.treesAdded = (newStats.treesAdded || 0) + 1; break;
        case 'care_tree': points = 50; newStats.treesCared = (newStats.treesCared || 0) + 1; break;
        case 'identify_tree': points = 10; newStats.treesIdentified = (newStats.treesIdentified || 0) + 1; break;
        case 'adopt_tree': points = 20; break;
        case 'comment_tree': points = 5; break;
    }
    if (points > 0) {
        newStats.points = (newStats.points || 0) + points;
        showToast(`+${points} Pontos!`);
        appState.currentUser = newStats;
        const userRef = doc(db, "users", appState.currentUser.uid);
        try {
            await updateDoc(userRef, {
                points: newStats.points,
                treesAdded: newStats.treesAdded,
                treesCared: newStats.treesCared,
                treesIdentified: newStats.treesIdentified
            });
        } catch (e) {}
    }
    updateGamificationUI();
};

const updateGamificationUI = () => {
    const user = appState.currentUser;
    if (!user) return;
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-avatar').src = user.photoURL;
    document.getElementById('profile-level').textContent = user.levelName;
    
    const pointsToLevelUp = 1000;
    const currentPoints = parseFloat(user.points) || 0; 
    let progress = (currentPoints / pointsToLevelUp) * 100;
    if (progress > 100) progress = 100;

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
    const el = document.querySelector(`[data-achievement="${name}"]`);
    if (el) {
        el.querySelector('.progress-bar').style.width = `${Math.min((current / goal) * 100, 100)}%`;
        el.querySelector('.counter').textContent = `${current}/${goal}`;
    }
};

const loadAdoptedTreesForProfile = async () => {
    const listEl = document.getElementById('adopted-trees-list');
    const q = query(collection(db, "users", appState.currentUser.uid, "adoptedTrees"), orderBy("adoptedAt", "desc"));
    try {
        const s = await getDocs(q);
        if (s.empty) { listEl.innerHTML = `<p class="text-gray-500 text-center italic">Nenhuma ainda.</p>`; return; }
        listEl.innerHTML = '';
        s.forEach((doc) => {
            const t = doc.data();
            const el = document.createElement('div');
            el.className = "bg-cinza p-3 rounded-lg flex items-center gap-3 cursor-pointer";
            el.innerHTML = `
                <img src="${t.coverPhoto}" class="w-12 h-12 rounded-lg object-cover">
                <div><p class="font-bold text-verde-principal">${t.commonName}</p><p class="text-sm text-gray-600">${t.scientificName}</p></div>
            `;
            el.addEventListener('click', () => showTreeProfile(doc.id));
            listEl.appendChild(el);
        });
    } catch (e) { listEl.innerHTML = 'Erro ao carregar.'; }
};

// =======================================================
// ## NOVA LÓGICA DE GPS (WATCH POSITION) ##
// =======================================================

const startLocationWatcher = () => {
    if (!('geolocation' in navigator)) {
        console.error("GPS não suportado.");
        return;
    }

    if (appState.locationWatcherId) navigator.geolocation.clearWatch(appState.locationWatcherId);
    console.log("Iniciando rastreamento GPS...");
    
    appState.locationWatcherId = navigator.geolocation.watchPosition(
        (position) => {
            appState.lastUserLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            appState.locationAccuracy = position.coords.accuracy;
            appState.locationPermissionGranted = true;
            
            if (appState.map && appState.userMarker) {
                appState.userMarker.setLatLng([position.coords.latitude, position.coords.longitude]);
            }
        },
        (error) => { console.warn("Erro WatchPosition:", error.code); },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
};

const promptForLocation = () => {
    if (appState.locationPermissionGranted && appState.lastUserLocation) {
        showPage('map');
        initializeMap();
        return;
    }

    const modal = document.getElementById('location-permission-modal');
    modal.classList.remove('hidden');

    document.getElementById('btn-grant-location').onclick = () => {
        modal.classList.add('hidden');
        showLoadingModal(true, "Ativando GPS...");
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                appState.lastUserLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                appState.locationAccuracy = position.coords.accuracy;
                appState.locationPermissionGranted = true;
                startLocationWatcher();
                showPage('map');
                initializeMap();
                showLoadingModal(false);
            },
            (error) => {
                console.error("Erro GPS:", error);
                showToast("Erro ao obter GPS. Verifique se a localização está ativa.");
                appState.lastUserLocation = { latitude: -22.9068, longitude: -43.1729 };
                appState.locationPermissionGranted = false;
                showPage('map');
                initializeMap();
                showLoadingModal(false);
            },
            { enableHighAccuracy: true }
        );
    };
};

// --- MAPA ---
const initializeMap = () => {
    if (appState.map) { 
        appState.map.invalidateSize();
        return;
    }
    
    const initialLat = appState.lastUserLocation?.latitude || -22.9068;
    const initialLng = appState.lastUserLocation?.longitude || -43.1729;
    
    appState.map = L.map('map-container', { zoomControl: false, maxZoom: 22 }).setView([initialLat, initialLng], 17);
    
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
        maxZoom: 22, subdomains:['mt0','mt1','mt2','mt3'], attribution: 'Google'
    }).addTo(appState.map);
    
    L.control.zoom({ position: 'topright' }).addTo(appState.map);

    if (appState.locationPermissionGranted) {
        appState.userMarker = L.marker([initialLat, initialLng]).addTo(appState.map).bindPopup("Você").openPopup();
    }
    loadTreesOnMap();
};

const centerMapOnUserLocation = () => {
    if (appState.lastUserLocation) {
        appState.map.setView([appState.lastUserLocation.latitude, appState.lastUserLocation.longitude], 18);
    } else {
        promptForLocation();
    }
};

const addTreeMarkerToMap = (tree) => {
    if (!tree.location) return;

    let rawLat = tree.location.latitude ?? tree.location.lat ?? tree.location._lat;
    let rawLng = tree.location.longitude ?? tree.location.lng ?? tree.location._long;
    let lat = parseFloat(rawLat);
    let lng = parseFloat(rawLng);

    if (isNaN(lat) || isNaN(lng)) return;

    // JITTER (Dispersão)
    const jitterAmount = 0.00015; 
    const pseudoRandom = tree.id.charCodeAt(0) + tree.id.charCodeAt(tree.id.length - 1);
    const offsetLat = ((pseudoRandom % 10) - 5) * (jitterAmount / 5);
    const offsetLng = ((pseudoRandom % 8) - 4) * (jitterAmount / 4);
    lat += offsetLat;
    lng += offsetLng;

    const latLng = [lat, lng];
    if (appState.treeMarkers[tree.id]) { appState.treeMarkers[tree.id].setLatLng(latLng); return; }

    let iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png';
    if (tree.status === 'healthy') iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png';
    else if (tree.status === 'needs-care') iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png';
    else if (tree.status === 'critical') iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png';
    
    const treeIcon = L.icon({
        iconUrl: iconUrl, shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    const marker = L.marker(latLng, { icon: treeIcon });
    marker.on('click', () => showTreeProfile(tree.id));
    marker.addTo(appState.map);
    appState.treeMarkers[tree.id] = marker;
};

const loadTreesOnMap = () => {
    const q = query(collection(db, "trees"));
    onSnapshot(q, (snapshot) => {
        snapshot.forEach((doc) => {
            try { addTreeMarkerToMap({ id: doc.id, ...doc.data() }); } catch (e) {}
        });
    }, (e) => console.error(e));
};

// --- PERFIL DA ÁRVORE ---
const showTreeProfile = async (treeId) => {
    showLoadingModal(true, "Abrindo...");
    try {
        const docSnap = await getDoc(doc(db, "trees", treeId));
        if (!docSnap.exists()) throw new Error("Árvore sumiu.");
        appState.currentTree = { id: docSnap.id, ...docSnap.data() };
        
        const t = appState.currentTree;
        document.getElementById('tree-profile-name').textContent = t.commonName;
        document.getElementById('tree-profile-scientific-name').textContent = t.scientificName;
        
        let locText = "Sem local";
        if (t.location) {
             const la = t.location.latitude || t.location.lat;
             const lo = t.location.longitude || t.location.lng;
             locText = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
             if (t.gpsAccuracy) locText += ` (Precisão: ${Math.round(t.gpsAccuracy)}m)`;
        }
        document.getElementById('tree-profile-address').querySelector('span').textContent = locText;
        document.getElementById('tree-profile-image').src = t.coverPhoto;

        const sb = document.getElementById('tree-profile-status-badge');
        if (t.status === 'healthy') { sb.className = 'bg-sucesso text-white p-2 rounded-lg font-bold block text-center'; sb.textContent = 'Saudável'; }
        else if (t.status === 'needs-care') { sb.className = 'bg-alerta text-yellow-800 p-2 rounded-lg font-bold block text-center'; sb.textContent = 'Precisa de Cuidado'; }
        else { sb.className = 'bg-erro text-white p-2 rounded-lg font-bold block text-center'; sb.textContent = 'Crítico'; }

        loadTreeSubcollection(treeId, 'careEvents', 'tree-profile-history', renderHistoryEvent);
        loadTreeSubcollection(treeId, 'careEvents', 'tree-profile-timeline', renderTimelineEvent, true);
        loadTreeSubcollection(treeId, 'adopters', 'tree-profile-adopters', renderAdopter);
        checkAdoptionStatus(treeId);
        showPage('tree-profile');
    } catch (e) { showToast("Erro ao abrir árvore."); } finally { showLoadingModal(false); }
};

const loadTreeSubcollection = (tid, sub, cid, render, filter=false) => {
    const c = document.getElementById(cid);
    c.innerHTML = '...';
    let q = query(collection(db, "trees", tid, sub));
    if (sub === 'careEvents') q = query(q, orderBy("timestamp", "desc"));
    
    onSnapshot(q, (s) => {
        if (s.empty) { c.innerHTML = '<p class="text-gray-500 italic text-sm">Nada aqui.</p>'; return; }
        c.innerHTML = '';
        let count = 0;
        s.forEach(d => {
            const i = d.data();
            if (filter && !i.message && !i.photoUrl) return;
            c.innerHTML += render(i);
            count++;
        });
        if (filter && count===0) c.innerHTML = '<p class="text-gray-500 italic text-sm">Sem mensagens.</p>';
        lucide.createIcons();
    });
};

const renderHistoryEvent = (e) => `<div class="p-1 border-b text-sm"><span class="font-bold">${e.timestamp?.toDate().toLocaleDateString('pt-BR')}:</span> ${e.user.name} ${e.action}</div>`;
const renderTimelineEvent = (e) => `
    <div class="bg-cinza p-3 rounded-lg mb-2 relative">
        <div class="flex items-center mb-1"><img src="${e.user.photoURL}" class="w-6 h-6 rounded-full"><p class="ml-2 font-bold text-sm">${e.user.name}</p></div>
        ${e.photoUrl ? `<img src="${e.photoUrl}" class="w-full rounded-lg mb-1">` : ''}
        ${e.message ? `<p class="text-sm italic">"${e.message}"</p>` : ''}
    </div>`;
const renderAdopter = (a) => `<span class="bg-verde-claro bg-opacity-50 text-verde-principal text-xs font-bold px-2 py-1 rounded-full flex gap-1 items-center"><img src="${a.photoURL}" class="w-4 h-4 rounded-full">${a.name}</span>`;

// --- AÇÕES ---
const checkAdoptionStatus = async (tid) => {
    const btn = document.getElementById('btn-adopt-tree');
    if (!btn) return;
    const snap = await getDoc(doc(db, "trees", tid, "adopters", appState.currentUser.uid));
    if (snap.exists()) { btn.innerHTML = '<i data-lucide="heart-off"></i> Remover'; btn.classList.add('text-erro'); }
    else { btn.innerHTML = '<i data-lucide="heart"></i> Adotar'; btn.classList.remove('text-erro'); }
    lucide.createIcons();
};

const handleAdoptTree = async () => {
    const t = appState.currentTree;
    const u = appState.currentUser;
    const btn = document.getElementById('btn-adopt-tree');
    btn.disabled = true;
    try {
        const refT = doc(db, "trees", t.id, "adopters", u.uid);
        const refU = doc(db, "users", u.uid, "adoptedTrees", t.id);
        const s = await getDoc(refT);
        if (s.exists()) { await deleteDoc(refT); await deleteDoc(refU); showToast("Adoção removida."); }
        else {
            await setDoc(refT, { name: u.name, photoURL: u.photoURL, adoptedAt: serverTimestamp() });
            await setDoc(refU, { commonName: t.commonName, scientificName: t.scientificName, coverPhoto: t.coverPhoto, adoptedAt: serverTimestamp() });
            showToast("Adotada com sucesso!"); awardPoints('adopt_tree');
        }
        checkAdoptionStatus(t.id);
    } catch (e) { showToast("Erro."); } finally { btn.disabled = false; }
};

const handlePostComment = async () => {
    const t = appState.currentTree;
    const input = document.getElementById('tree-comment-input');
    const photoInput = document.getElementById('tree-comment-photo-input');
    if (!input.value && !photoInput.files[0]) return showToast("Escreva algo!");
    
    showLoadingModal(true, "Enviando...");
    try {
        const url = await uploadImage(photoInput.files[0], 'photos');
        await addDoc(collection(db, "trees", t.id, "careEvents"), {
            action: "comentou.", message: input.value, photoUrl: url,
            user: { id: appState.currentUser.uid, name: appState.currentUser.name, photoURL: appState.currentUser.photoURL }, timestamp: serverTimestamp()
        });
        awardPoints('comment_tree'); showToast("Enviado!");
        input.value = ''; photoInput.value = null;
        document.getElementById('tree-comment-photo-preview').classList.add('hidden');
    } catch (e) { showToast("Erro."); } finally { showLoadingModal(false); }
};

const handleFinishCare = async () => {
    const t = appState.currentTree;
    showLoadingModal(true, "Salvando...");
    try {
        const url = await uploadImage(document.getElementById('care-photo-input').files[0], 'photos');
        await addDoc(collection(db, "trees", t.id, "careEvents"), {
            action: "cuidou da planta.", message: document.getElementById('care-message').value, photoUrl: url,
            user: { id: appState.currentUser.uid, name: appState.currentUser.name, photoURL: appState.currentUser.photoURL }, timestamp: serverTimestamp()
        });
        awardPoints('care_tree'); showToast("Obrigado por cuidar! 🌳"); showPage('tree-profile');
    } catch (e) { showToast("Erro."); } finally { showLoadingModal(false); }
};

const uploadImage = async (file, path) => {
    if (!file) return null;
    const refF = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const snap = await uploadBytes(refF, file);
    return await getDownloadURL(snap.ref);
};

// --- IDENTIFICAÇÃO E CADASTRO ---
const requestCameraAccess = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        document.getElementById('camera-feed').srcObject = stream;
        document.getElementById('camera-feed').classList.remove('hidden');
        document.getElementById('camera-placeholder').classList.add('hidden');
    } catch (e) { showToast("Erro câmera."); }
};
const capturePhotoFromFeed = () => {
    const v = document.getElementById('camera-feed');
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(b => handlePlantIdentification(b), 'image/jpeg', 0.95);
};

const handlePlantIdentification = async (file) => {
    showPage('result'); showLoadingModal(true, "Identificando...");
    document.getElementById('result-plant-image').src = URL.createObjectURL(file);
    const fd = new FormData(); fd.append('images', file);
    try {
        const res = await fetch('/.netlify/functions/identify', { method: 'POST', body: fd });
        const d = await res.json();
        const best = d.results?.[0];
        if (best && best.score > 0.2) {
            appState.currentPlantInfo = { commonName: best.species.commonNames?.[0] || best.species.scientificNameWithoutAuthor, scientificName: best.species.scientificNameWithoutAuthor };
            document.getElementById('result-common-name').textContent = appState.currentPlantInfo.commonName;
            document.getElementById('result-scientific-name').textContent = appState.currentPlantInfo.scientificName;
            document.getElementById('result-confidence').textContent = `${Math.round(best.score*100)}%`;
            document.getElementById('result-confidence-bar').style.width = `${Math.round(best.score*100)}%`;
        } else { throw new Error("Não identificado."); }
    } catch (e) { 
        appState.currentPlantInfo = null; 
        document.getElementById('result-common-name').textContent = "Não identificada";
        showToast("Tente outra foto."); 
    } finally { showLoadingModal(false); }
};

const initiateCareFlow = () => {
    if (!appState.currentPlantInfo) return showToast("Erro na identificação.");
    showPage('care');
    document.getElementById('care-title').textContent = "Nova Descoberta!";
    document.getElementById('care-subtitle').textContent = `Cadastrar ${appState.currentPlantInfo.commonName}?`;
    document.getElementById('care-actions-container').classList.add('hidden');
    document.getElementById('add-tree-button-container').classList.remove('hidden');
};

// =======================================================
// ## SEGURANÇA NO CADASTRO (AQUI ESTÁ A PROTEÇÃO) ##
// =======================================================

const handleRegisterNewTree = async () => {
    if (!appState.locationPermissionGranted || !appState.lastUserLocation) {
        showToast("⚠️ Erro de GPS: Localização não encontrada.");
        startLocationWatcher();
        return;
    }
    const lat = appState.lastUserLocation.latitude;
    const lng = appState.lastUserLocation.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return showToast("⚠️ Erro Crítico: GPS inválido.");

    const photoFile = document.getElementById('add-tree-photo-input').files[0];
    if (!photoFile) return showToast("Falta a foto da árvore.");

    showLoadingModal(true, "Cadastrando com GPS preciso...");

    try {
        const photoUrl = await uploadImage(photoFile, 'photos');
        const newTree = {
            commonName: appState.currentPlantInfo.commonName,
            scientificName: appState.currentPlantInfo.scientificName,
            status: document.getElementById('add-tree-health').value,
            location: new GeoPoint(lat, lng),
            gpsAccuracy: appState.locationAccuracy || 999, 
            coverPhoto: photoUrl,
            createdAt: serverTimestamp(),
            createdBy: { uid: appState.currentUser.uid, name: appState.currentUser.name }
        };
        
        const refD = await addDoc(collection(db, "trees"), newTree);
        await addDoc(collection(db, "trees", refD.id, "careEvents"), {
            action: "cadastrou.", message: document.getElementById('add-tree-message').value,
            user: { id: appState.currentUser.uid, name: appState.currentUser.name, photoURL: appState.currentUser.photoURL },
            timestamp: serverTimestamp(), photoUrl: photoUrl
        });
        
        awardPoints('add_tree'); showToast("Árvore cadastrada! 📍"); showPage('map');
    } catch (e) { showToast("Erro ao salvar."); } finally { showLoadingModal(false); }
};

// --- SABER MAIS / FEED ---

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
                <div class="w-full h-48 bg-gray-300 flex items-center justify-center"><i data-lucide="instagram" class="w-12 h-12 text-gray-500"></i></div>
                <div class="p-3"><p class="font-bold text-md">${content.title}</p><p class="text-sm text-verde-principal font-semibold">${content.creator}</p></div>
            </a>`;
        lucide.createIcons();
    } else {
        resultsContainer.innerHTML = `<p class="text-center text-gray-600">O Arvoreco ainda está aprendendo sobre "${query}".</p>`;
    }
};

const loadFeedPosts = async () => {
    const feedContainer = document.getElementById('feed-posts-container');
    feedContainer.innerHTML = '<p class="text-center text-gray-500">Carregando...</p>';
    try {
        const q = query(collectionGroup(db, 'careEvents'), orderBy('timestamp', 'desc'), limit(15));
        const snapshot = await getDocs(q);
        if (snapshot.empty) { feedContainer.innerHTML = `<p class="text-center text-gray-500 italic">Feed vazio.</p>`; return; }
        feedContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const event = doc.data();
            if (event.photoUrl || event.message) feedContainer.innerHTML += renderTimelineEvent(event);
        });
    } catch (e) { feedContainer.innerHTML = `<p class="text-erro text-center">Erro.</p>`; }
};

const setAppHeight = () => document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);

const setupEventListeners = () => {
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-btn, .nav-to-btn');
        if (btn && btn.dataset.page) showPage(btn.dataset.page);
    });
    
    // Auth
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-google-login-main').addEventListener('click', handleGoogleLogin);
    document.getElementById('btn-google-login-signup').addEventListener('click', handleGoogleLogin);
    
    // Core
    document.getElementById('plant-photo-input').addEventListener('change', (e) => { if(e.target.files[0]) handlePlantIdentification(e.target.files[0]); });
    document.getElementById('btn-capture').addEventListener('click', capturePhotoFromFeed);
    document.getElementById('btn-initiate-care').addEventListener('click', initiateCareFlow);
    document.getElementById('btn-finish-add-tree').addEventListener('click', handleRegisterNewTree);
    document.getElementById('add-tree-photo-input').addEventListener('change', (e) => { 
        document.getElementById('add-tree-photo-preview').src = URL.createObjectURL(e.target.files[0]); 
        document.getElementById('add-tree-photo-preview').classList.remove('hidden'); 
    });
    document.getElementById('btn-locate-me').addEventListener('click', centerMapOnUserLocation);
    document.getElementById('btn-finish-care').addEventListener('click', handleFinishCare);
    
    // Profile Tree
    document.getElementById('btn-care-from-profile').addEventListener('click', () => { 
        showPage('care'); 
        document.getElementById('care-title').textContent = appState.currentTree.commonName; 
        document.getElementById('care-subtitle').textContent = "Cuidar";
        document.getElementById('care-actions-container').classList.remove('hidden'); 
        document.getElementById('add-tree-button-container').classList.add('hidden');
    });
    document.getElementById('btn-adopt-tree').addEventListener('click', handleAdoptTree);
    document.getElementById('btn-post-comment').addEventListener('click', handlePostComment);
    document.getElementById('tree-comment-photo-input').addEventListener('change', (e) => { 
        document.getElementById('tree-comment-photo-preview').src = URL.createObjectURL(e.target.files[0]); 
        document.getElementById('tree-comment-photo-preview').classList.remove('hidden'); 
    });

    // Learn
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
    
    // Modals
    document.getElementById('btn-show-forgot-password').addEventListener('click', () => document.getElementById('forgot-password-modal').classList.remove('hidden'));
    document.getElementById('btn-close-forgot-modal').addEventListener('click', () => document.getElementById('forgot-password-modal').classList.add('hidden'));
    document.getElementById('btn-show-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
    document.getElementById('btn-close-help-modal').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
};

document.addEventListener('DOMContentLoaded', initializeAppCore);