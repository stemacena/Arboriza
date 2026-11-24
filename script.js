/* ==========================================================================
   ARBORIZA 2.1 — SCRIPT PRINCIPAL (Produção / Segurança / Frutiger Aero)
   - Preserva 100% do banco de dados existente (users, trees, careEvents,
     adopters, adoptedTrees), integração Pl@ntNet e backend Python MapBiomas.
   - Privacidade LGPD: separa dados privados (/users) de /publicProfiles,
     com consentimento no cadastro e chave de visibilidade no Perfil.
   - Rede Social, Busca, Perfis Públicos, Vouchers e Parceiros corrigidos.
   - Missões e Emblemas desacoplados (emblemas exigem múltiplas missões).
   ========================================================================== */

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
    where,
    getDocs,
    onSnapshot,
    orderBy,
    limit,
    collectionGroup,
    serverTimestamp,
    GeoPoint,
    updateDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    increment
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

// E-mails autorizados a acessar o Painel de Administrador (espelhados nas Firestore Rules)
const ADMIN_EMAILS = [
    "arborizarj@gmail.com",
    "stephannie.macena@edu.unirio.br",
    "tiagomartins.one@gmail.com"
];

const PYTHON_BACKEND_URL = "https://arboriza-backend.onrender.com";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- 2. REGRAS DE GAMIFICAÇÃO (NÍVEIS, MISSÕES E EMBLEMAS MULTI-MISSÃO) ---
const LEVELS = [
    { level: 1, name: "Nível 1: Semente", minPoints: 0, emoji: "🌱" },
    { level: 2, name: "Nível 2: Broto Urbano", minPoints: 300, emoji: "🌿" },
    { level: 3, name: "Nível 3: Muda Resistente", minPoints: 800, emoji: "🍀" },
    { level: 4, name: "Nível 4: Raiz do Território", minPoints: 1600, emoji: "🌳" },
    { level: 5, name: "Nível 5: Guardião da Copa", minPoints: 3000, emoji: "🦋" },
    { level: 6, name: "Nível 6: Mestre da Mata Atlântica", minPoints: 5000, emoji: "🌍" },
    { level: 7, name: "Nível 7: Guardião Ancestral", minPoints: 8000, emoji: "🫧" }
];

const MISSIONS = [
    {
        id: "mission_identify_5",
        title: "Olhar Atento",
        description: "Identifique 5 árvores urbanas usando a câmera do Arboriza.",
        statKey: "treesIdentified",
        goal: 5,
        rewardPoints: 100,
        emoji: "🔎"
    },
    {
        id: "mission_identify_15",
        title: "Explorador Botânico",
        description: "Identifique 15 árvores urbanas para conhecer a flora do bairro.",
        statKey: "treesIdentified",
        goal: 15,
        rewardPoints: 250,
        emoji: "🍃"
    },
    {
        id: "mission_care_5",
        title: "Mão na Terra",
        description: "Realize 5 ações de cuidado (rega ou limpeza de canteiro).",
        statKey: "treesCared",
        goal: 5,
        rewardPoints: 120,
        emoji: "🌱"
    },
    {
        id: "mission_care_10",
        title: "Cuidador Constante",
        description: "Realize 10 ações de cuidado em árvores urbanas.",
        statKey: "treesCared",
        goal: 10,
        rewardPoints: 300,
        emoji: "💧"
    },
    {
        id: "mission_add_3",
        title: "Primeiras Raízes",
        description: "Cadastre 3 novas árvores no mapa colaborativo da cidade.",
        statKey: "treesAdded",
        goal: 3,
        rewardPoints: 150,
        emoji: "🗺️"
    },
    {
        id: "mission_add_8",
        title: "Cartógrafo Verde",
        description: "Cadastre 8 novas árvores para expandir o inventário urbano.",
        statKey: "treesAdded",
        goal: 8,
        rewardPoints: 400,
        emoji: "📍"
    },
    {
        id: "mission_adopt_5",
        title: "Guardião Afetivo",
        description: "Adote 5 árvores para acompanhar sua evolução de perto.",
        statKey: "treesAdoptedCount",
        goal: 5,
        rewardPoints: 150,
        emoji: "💚"
    },
    {
        id: "mission_escrevivencia_10",
        title: "Escrevivência",
        description: "Registre 10 mensagens em murais de árvores ou comentários no feed.",
        statKey: "commentsCount",
        goal: 10,
        rewardPoints: 150,
        emoji: "💬"
    },
    {
        id: "mission_follow_5",
        title: "Rede de Raízes",
        description: "Conecte-se seguindo 5 guardiões na comunidade Arboriza.",
        statKey: "followingCount",
        goal: 5,
        rewardPoints: 100,
        emoji: "🌐"
    },
    {
        id: "mission_care_25",
        title: "Protetor do Bairro",
        description: "Alcance a marca de 25 cuidados registrados em árvores urbanas.",
        statKey: "treesCared",
        goal: 25,
        rewardPoints: 500,
        emoji: "🛡️"
    }
];

// Cada emblema exige concluir múltiplas missões diferentes
const EMBLEMS = [
    {
        id: "guardiao_territorio",
        name: "Guardiã(o) do Território",
        description: "Conclua 3 missões de cuidado e afeto pelas árvores.",
        requiredMissions: ["mission_care_5", "mission_care_10", "mission_adopt_5"],
        emoji: "💧"
    },
    {
        id: "botanico_urbano",
        name: "Botânico(a) Urbano(a)",
        description: "Conclua 3 missões de identificação e mapeamento inicial.",
        requiredMissions: ["mission_identify_5", "mission_identify_15", "mission_add_3"],
        emoji: "🍃"
    },
    {
        id: "desbravador_cidade",
        name: "Desbravador(a) da Cidade",
        description: "Conclua as missões de cartografia verde do seu bairro.",
        requiredMissions: ["mission_add_3", "mission_add_8"],
        emoji: "🧭"
    },
    {
        id: "tecelao_memorias",
        name: "Tecelão(ã) de Memórias",
        description: "Conclua as missões de Escrevivência e conexão comunitária.",
        requiredMissions: ["mission_escrevivencia_10", "mission_follow_5"],
        emoji: "💬"
    },
    {
        id: "mestre_mata_atlantica",
        name: "Mestre da Mata Atlântica",
        description: "Conclua 3 grandes missões avançadas de preservação urbana.",
        requiredMissions: ["mission_care_25", "mission_identify_15", "mission_add_8"],
        emoji: "🌍"
    }
];

// --- 3. CLASSIFICADOR BOTÂNICO (ÁRVORE vs. PLANTA/ARBUSTO) ---
const KNOWN_TREE_GENERA = new Set([
    "handroanthus", "tabebuia", "paubrasilia", "caesalpinia", "cenostigma", "libidibia",
    "inga", "ficus", "mangifera", "psidium", "eugenia", "syzygium", "licania", "moquilea",
    "terminalia", "delonix", "bauhinia", "cassia", "senna", "schinus", "cecropia", "pachira",
    "spathodea", "tipuana", "jacaranda", "tibouchina", "pleroma", "erythrina", "ceiba",
    "roystonea", "cocos", "syagrus", "euterpe", "araucaria", "eucalyptus", "pinus", "citrus",
    "persea", "artocarpus", "morus", "anacardium", "tamarindus", "spondias", "plinia",
    "myrciaria", "campomanesia", "lafoensia", "lagerstroemia", "sapindus", "piptadenia",
    "anadenanthera", "enterolobium", "samanea", "albizia", "leucaena", "eriobotrya",
    "malpighia", "punica", "averrhoa", "annona", "carica", "cedrela", "cariniana",
    "hymenaea", "lecythis", "couroupita", "chrysophyllum", "pouteria", "genipa", "alchornea",
    "trema", "croton", "guarea", "trichilia", "tapirira", "astronium", "myracrodruon",
    "peltophorum", "schizolobium", "mimosa", "clitoria", "grevillea", "casuarina", "melia",
    "azadirachta", "swietenia", "khaya", "tecoma", "crescentia", "kigelia", "cordia",
    "ziziphus", "hura", "hevea", "bertholletia", "theobroma", "coffea", "ilex", "prunus",
    "quercus", "salix", "populus", "betula", "acer", "fraxinus", "ulmus", "platanus",
    "magnolia", "cinnamomum", "laurus", "olea", "phoenix", "washingtonia", "dypsis", "archontophoenix"
]);

const KNOWN_NON_TREE_FAMILIES = new Set([
    "poaceae", "cyperaceae", "orchidaceae", "bromeliaceae", "cactaceae", "crassulaceae",
    "commelinaceae", "araceae", "marantaceae", "begoniaceae", "lamiaceae", "apiaceae",
    "brassicaceae", "cucurbitaceae", "amaryllidaceae", "iridaceae", "liliaceae", "asparagaceae",
    "polypodiaceae", "pteridaceae", "nephrolepidaceae", "violaceae", "geraniaceae", "portulacaceae"
]);

const KNOWN_NON_TREE_GENERA = new Set([
    "tradescantia", "monstera", "epipremnum", "philodendron", "sansevieria", "aloe",
    "kalanchoe", "echeveria", "sedum", "zamioculcas", "spathiphyllum", "anthurium",
    "calathea", "goeppertia", "maranta", "coleus", "plectranthus", "impatiens", "rosa",
    "ocimum", "mentha", "salvia", "petunia", "tagetes", "helianthus", "gerbera", "viola",
    "nephrolepis", "adiantum", "chlorophytum", "peperomia", "pilea", "fittonia", "syngonium",
    "dieffenbachia", "aglaonema", "caladium", "alocasia", "colocasia", "canna", "heliconia",
    "strelitzia", "bougainvillea", "allamanda", "ixora", "lantana", "duranta", "plumbago"
]);

const TREE_COMMON_KEYWORDS = [
    "árvore", "arvore", "ipê", "ipe", "mangueira", "oiti", "ingá", "inga", "pau-brasil",
    "pitangueira", "jabuticabeira", "amendoeira", "flamboyant", "quaresmeira", "sibipiruna",
    "palmeira", "coqueiro", "figueira", "jaqueira", "goiabeira", "aroeira", "embaúba",
    "paineira", "jacarandá", "jacaranda", "ficus", "cedro", "jequitibá", "jambo", "jambeiro",
    "cajueiro", "abacateiro", "limoeiro", "laranjeira", "amoreira", "tamarindo", "acácia",
    "eucalipto", "pinheiro", "castanheira", "jatobá", "sapucaia", "abrico", "abricó",
    "mulungu", "pata-de-vaca", "chuva-de-ouro", "espatódea", "tipuana", "resedá", "acerola",
    "caramboleira", "graviola", "pinha", "mamoeiro", "cajazeira", "seriguela", "jenipapo"
];

const classifyPlantHabit = (speciesData) => {
    if (!speciesData) {
        return { isTree: true, category: "uncertain", label: "🌱 Espécie Vegetal", note: "Confirme se este exemplar é uma árvore." };
    }

    if (typeof speciesData.isTree === "boolean") {
        return speciesData.isTree
            ? { isTree: true, category: "tree", label: "🌳 Árvore Urbana", note: "Identificada como espécie arbórea (conta para missões de árvores)." }
            : { isTree: false, category: "plant", label: "🌿 Planta / Arbusto", note: "Identificada como planta não arbórea. Você ainda ganha pontos pela identificação!" };
    }

    const genus = (speciesData.genus?.scientificNameWithoutAuthor || "").toLowerCase().trim();
    const family = (speciesData.family?.scientificNameWithoutAuthor || "").toLowerCase().trim();
    const sciName = (speciesData.scientificNameWithoutAuthor || "").toLowerCase();
    const commonNames = (speciesData.commonNames || []).map(n => n.toLowerCase());
    const firstWordGenus = sciName.split(" ")[0] || "";

    if (KNOWN_TREE_GENERA.has(genus) || KNOWN_TREE_GENERA.has(firstWordGenus)) {
        return {
            isTree: true,
            category: "tree",
            label: "🌳 Árvore Identificada",
            note: `Gênero arbóreo reconhecido (${speciesData.genus?.scientificNameWithoutAuthor || firstWordGenus}). Conta para missões de árvores!`
        };
    }

    if (commonNames.some(cn => TREE_COMMON_KEYWORDS.some(kw => cn.includes(kw)))) {
        return {
            isTree: true,
            category: "tree",
            label: "🌳 Árvore Identificada",
            note: "Reconhecida como espécie arbórea. Conta para missões e cadastro no mapa!"
        };
    }

    if (KNOWN_NON_TREE_GENERA.has(genus) || KNOWN_NON_TREE_GENERA.has(firstWordGenus) || KNOWN_NON_TREE_FAMILIES.has(family)) {
        return {
            isTree: false,
            category: "plant",
            label: "🌿 Planta / Herbácea",
            note: `Esta espécie (${speciesData.family?.scientificNameWithoutAuthor || "herbácea/ornamental"}) não é classificada como árvore. Marque abaixo caso seja um exemplar arbóreo.`
        };
    }

    return {
        isTree: true,
        category: "uncertain",
        label: "🌱 Espécie Vegetal",
        note: "Porte botânico variado. Confirme abaixo se o exemplar fotografado é uma árvore."
    };
};

// --- 4. ESTADO GLOBAL DA APLICAÇÃO ---
const appState = {
    currentUser: null,
    currentPartnerDoc: null,
    currentTree: null,
    currentPlantInfo: null,
    tempTreePhotoFile: null,
    lastUserLocation: null,
    locationPermissionGranted: false,
    map: null,
    userMarker: null,
    treeMarkers: {},
    partnersMap: null,
    partnerMarkers: {},
    partnerSignupMap: null,
    partnerSignupMarker: null,
    followingIds: new Set(),
    feedFilter: "all",
    pendingAuthRole: "guardian",
    pendingPartnerSignupData: null,
    pendingFeedPublishResolver: null,
    cachedPartners: [],
    cachedProfiles: [],
    profilesLoadedOnce: false,
    selectedPartnerDetail: null,
    selectedPublicProfileUid: null,
    activeTreeUnsubscribers: [],
    treesMapUnsubscriber: null
};

// --- 5. SEGURANÇA, SANITIZAÇÃO E UTILITÁRIOS ---
const escapeHtml = (unsafe = "") => {
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const sanitizeUrl = (url = "", fallback = "") => {
    if (!url || typeof url !== "string") return fallback;
    const trimmed = url.trim();
    if (/^(https?:\/\/|blob:|assets\/)/i.test(trimmed)) return trimmed;
    return fallback;
};

const normalizeText = (str = "") => {
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
};

const validateImageFile = (file) => {
    if (!file) return { ok: false, error: "Nenhum arquivo selecionado." };
    if (!file.type || !file.type.startsWith("image/")) {
        return { ok: false, error: "Selecione apenas arquivos de imagem (JPG, PNG ou WebP)." };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return { ok: false, error: "A imagem deve ter no máximo 5 MB." };
    }
    return { ok: true };
};

const isAdminUser = (user) => {
    if (!user) return false;
    return ADMIN_EMAILS.includes((user.email || "").toLowerCase());
};

const getLevelInfo = (points = 0) => {
    const numPoints = Number(points) || 0;
    let current = LEVELS[0];
    let next = LEVELS[1] || null;

    for (let i = 0; i < LEVELS.length; i++) {
        if (numPoints >= LEVELS[i].minPoints) {
            current = LEVELS[i];
            next = LEVELS[i + 1] || null;
        }
    }

    let progress = 100;
    if (next) {
        const range = next.minPoints - current.minPoints;
        const gained = numPoints - current.minPoints;
        progress = Math.max(0, Math.min(100, (gained / range) * 100));
    }

    return { current, next, progress };
};

const isMissionCompleted = (user, mission) => {
    if (!user || !mission) return false;
    const claimed = user.claimedMissions || [];
    if (claimed.includes(mission.id)) return true;
    return (Number(user[mission.statKey]) || 0) >= mission.goal;
};

const getEmblemProgress = (user, emblem) => {
    const reqList = emblem.requiredMissions || [];
    const details = reqList.map(mId => {
        const m = MISSIONS.find(item => item.id === mId);
        return {
            id: mId,
            title: m ? m.title : mId,
            emoji: m ? m.emoji : "🎯",
            done: m ? isMissionCompleted(user, m) : false
        };
    });
    const completedCount = details.filter(d => d.done).length;
    const totalCount = details.length || 1;
    return {
        details,
        completedCount,
        totalCount,
        pct: Math.min(100, (completedCount / totalCount) * 100),
        unlocked: completedCount >= totalCount
    };
};

const formatDateBR = (timestamp) => {
    if (!timestamp) return "Agora mesmo";
    try {
        const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
        return "Recente";
    }
};

const generateVoucherCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const randomValues = new Uint32Array(6);
    if (window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(randomValues);
    } else {
        for (let i = 0; i < 6; i++) randomValues[i] = Math.floor(Math.random() * chars.length);
    }
    let code = "ARB-";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(randomValues[i] % chars.length);
    }
    return code;
};

const getMissionTypeLabel = (type, count) => {
    switch (type) {
        case "treesCared": return `Cuidar de ${count} árvore(s)`;
        case "treesIdentified": return `Identificar ${count} árvore(s)`;
        case "treesAdded": return `Cadastrar ${count} árvore(s)`;
        case "treesAdoptedCount": return `Adotar ${count} árvore(s)`;
        case "points": return `Alcançar ${count} pontos`;
        default: return `Completar ${count} ações`;
    }
};

const stopCameraStream = () => {
    const videoEl = document.getElementById("camera-feed");
    if (videoEl && videoEl.srcObject) {
        const tracks = videoEl.srcObject.getTracks();
        tracks.forEach(t => t.stop());
        videoEl.srcObject = null;
        videoEl.classList.add("hidden");
        document.getElementById("camera-placeholder")?.classList.remove("hidden");
    }
};

const clearTreeSubcollectionListeners = () => {
    appState.activeTreeUnsubscribers.forEach(unsub => {
        try { unsub(); } catch {}
    });
    appState.activeTreeUnsubscribers = [];
};

// --- 6. SINCRONIZAÇÃO DE PERFIL PÚBLICO (LGPD — SEM EXPOR EMAIL) ---
const buildPublicProfilePayload = (userData) => {
    const levelInfo = getLevelInfo(userData.points || 0);
    const unlockedIds = EMBLEMS
        .filter(e => getEmblemProgress(userData, e).unlocked)
        .map(e => e.id);

    return {
        name: String(userData.name || "Guardião").slice(0, 80),
        photoURL: sanitizeUrl(
            userData.photoURL,
            `https://placehold.co/128x128/18981d/FFFFFF?text=${encodeURIComponent((userData.name || "G").charAt(0).toUpperCase())}`
        ),
        role: userData.role === "partner" ? "partner" : "guardian",
        level: levelInfo.current.level,
        levelName: levelInfo.current.name,
        points: Number(userData.points) || 0,
        treesCared: Number(userData.treesCared) || 0,
        treesIdentified: Number(userData.treesIdentified) || 0,
        treesAdded: Number(userData.treesAdded) || 0,
        treesAdoptedCount: Number(userData.treesAdoptedCount) || 0,
        unlockedEmblems: unlockedIds,
        updatedAt: serverTimestamp()
    };
};

const syncPublicProfile = async (uid, userData) => {
    if (!uid || !userData) return;
    if (userData.isPublicProfile === false) return; // Respeita opção de privacidade
    try {
        await setDoc(doc(db, "publicProfiles", uid), buildPublicProfilePayload(userData), { merge: true });
    } catch (err) {
        console.warn("Aviso ao sincronizar perfil público:", err);
    }
};

// --- 7. CICLO DE VIDA DA APLICAÇÃO ---
const acordarServidorPython = () => {
    fetch(`${PYTHON_BACKEND_URL}/`)
        .then(res => res.json())
        .then(() => console.log("🚀 Servidor Python MapBiomas pronto!"))
        .catch(() => console.log("Servidor Python acordando..."));
};

const initializeAppCore = () => {
    console.log("Arboriza 2.1 iniciando... (Segurança + LGPD + Frutiger Aero + Parceiros + Admin)");
    setAppHeight();
    window.addEventListener("resize", setAppHeight);
    if (window.lucide) lucide.createIcons();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchUserProfile(user.uid, user);
            acordarServidorPython();
        } else {
            stopCameraStream();
            clearTreeSubcollectionListeners();
            if (appState.treesMapUnsubscriber) {
                appState.treesMapUnsubscriber();
                appState.treesMapUnsubscriber = null;
            }
            appState.currentUser = null;
            appState.currentPartnerDoc = null;
            appState.followingIds = new Set();
            appState.cachedProfiles = [];
            appState.profilesLoadedOnce = false;
            showPage("onboarding");
            document.querySelector("main")?.classList.add("hidden");
            document.querySelector("nav")?.classList.add("hidden");
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
            const data = userSnap.data();
            const levelInfo = getLevelInfo(data.points || 0);
            appState.currentUser = {
                uid,
                isPublicProfile: true,
                treesCared: 0,
                treesIdentified: 0,
                plantsIdentified: 0,
                treesAdded: 0,
                treesAdoptedCount: 0,
                commentsCount: 0,
                followingCount: 0,
                followersCount: 0,
                claimedMissions: [],
                unlockedEmblems: [],
                ...data,
                email: authUser?.email || data.email || "",
                role: isAdminUser({ email: authUser?.email || data.email }) ? "admin" : (data.role || "guardian"),
                level: levelInfo.current.level,
                levelName: levelInfo.current.name
            };
        } else if (authUser) {
            const role = isAdminUser({ email: authUser.email })
                ? "admin"
                : (appState.pendingAuthRole === "partner" ? "partner" : "guardian");

            const displayName = appState.pendingPartnerSignupData?.businessName || authUser.displayName || "Guardião Anônimo";
            const newUserProfile = {
                name: displayName,
                email: authUser.email,
                photoURL: authUser.photoURL || `https://placehold.co/128x128/18981d/FFFFFF?text=${encodeURIComponent(displayName.charAt(0).toUpperCase())}`,
                role: role === "admin" ? "guardian" : role, // role admin sempre verificada via email nas Rules
                isPublicProfile: true,
                privacyConsent: true,
                privacyConsentAt: serverTimestamp(),
                level: 1,
                levelName: LEVELS[0].name,
                points: 0,
                treesCared: 0,
                treesIdentified: 0,
                plantsIdentified: 0,
                treesAdded: 0,
                treesAdoptedCount: 0,
                commentsCount: 0,
                followingCount: 0,
                followersCount: 0,
                claimedMissions: [],
                unlockedEmblems: [],
                createdAt: serverTimestamp()
            };
            await setDoc(userRef, newUserProfile);
            appState.currentUser = { uid, ...newUserProfile, role };

            if (role === "partner") {
                await createInitialPartnerDocument(uid, authUser.email, appState.pendingPartnerSignupData);
            }
            appState.pendingAuthRole = "guardian";
            appState.pendingPartnerSignupData = null;
        } else {
            showToast("Erro ao carregar seu perfil. Tente entrar novamente.");
            handleLogout();
            return;
        }

        await syncUserSocialAndAdoptionCounts();
        await syncPublicProfile(uid, appState.currentUser);

        if (appState.currentUser.role === "partner") {
            await loadOwnPartnerDocument(uid);
        }

        document.querySelector("main")?.classList.remove("hidden");
        document.querySelector("nav")?.classList.remove("hidden");

        updateRoleButtonsVisibility();
        updateGamificationUI();

        if (appState.currentUser.role === "partner") {
            showPage("partner-dashboard");
        } else {
            promptForLocation();
        }
    } catch (error) {
        console.error("Erro crítico ao buscar perfil:", error);
        showToast("Erro de conexão ou permissão. Verifique sua internet.");
    } finally {
        showLoadingModal(false);
    }
};

const syncUserSocialAndAdoptionCounts = async () => {
    if (!appState.currentUser) return;
    const uid = appState.currentUser.uid;
    try {
        const [followingSnap, followersSnap, adoptedSnap] = await Promise.all([
            getDocs(collection(db, "publicProfiles", uid, "following")),
            getDocs(collection(db, "publicProfiles", uid, "followers")),
            getDocs(collection(db, "users", uid, "adoptedTrees"))
        ]);

        appState.followingIds = new Set(followingSnap.docs.map(d => d.id));
        appState.currentUser.followingCount = appState.followingIds.size;
        appState.currentUser.followersCount = followersSnap.size;
        appState.currentUser.treesAdoptedCount = adoptedSnap.size;
    } catch (err) {
        console.warn("Aviso ao sincronizar conexões/adoções:", err);
    }
};

const updateRoleButtonsVisibility = () => {
    const partnerBtn = document.getElementById("btn-open-partner-dashboard");
    const adminBtn = document.getElementById("btn-open-admin-panel");
    const roleBadge = document.getElementById("profile-role-badge");

    if (partnerBtn) {
        partnerBtn.classList.toggle("hidden", appState.currentUser?.role !== "partner");
    }
    if (adminBtn) {
        adminBtn.classList.toggle("hidden", !isAdminUser(appState.currentUser));
    }
    if (roleBadge && appState.currentUser) {
        if (isAdminUser(appState.currentUser)) {
            roleBadge.textContent = "🛡️ Administrador Arboriza";
            roleBadge.classList.remove("hidden");
        } else if (appState.currentUser.role === "partner") {
            const isApproved = appState.currentPartnerDoc?.status === "approved";
            roleBadge.textContent = isApproved ? "✅ Parceiro Oficial Ativo" : "🕓 Parceiro (Aguardando Aprovação)";
            roleBadge.classList.remove("hidden");
        } else {
            roleBadge.textContent = "🌍 Guardião da Flora Urbana";
            roleBadge.classList.remove("hidden");
        }
    }
};

// --- 8. NAVEGAÇÃO E UI ---
const getScreens = () => document.querySelectorAll('#app-container > div[id^="screen-"], main > div[id^="screen-"]');
const loadingModal = document.getElementById("loading-modal");
const loadingMessage = document.getElementById("loading-message");

const showPage = (pageId) => {
    const publicPages = ["onboarding", "login", "signup", "partner-signup"];
    if (!appState.currentUser && !publicPages.includes(pageId)) {
        showPage("login");
        return;
    }

    if (pageId === "admin" && !isAdminUser(appState.currentUser)) {
        showToast("Acesso restrito a administradores.");
        showPage("map");
        return;
    }

    if (pageId !== "camera") {
        stopCameraStream();
    }

    getScreens().forEach(screen => screen.classList.add("hidden"));
    const activeScreen = document.getElementById(`screen-${pageId}`);

    if (activeScreen) {
        activeScreen.classList.remove("hidden");
    } else {
        console.error(`Tela screen-${pageId} não encontrada! Voltando para o mapa.`);
        showPage("map");
        return;
    }

    const nav = document.querySelector("nav");
    if (nav) {
        nav.style.display = publicPages.includes(pageId) ? "none" : "flex";
    }

    updateNavButtons(pageId);

    if (pageId === "map") {
        setTimeout(() => {
            if (!appState.map) initializeMap();
            else appState.map.invalidateSize();
        }, 60);
    }
    if (pageId === "partner-signup") {
        setTimeout(() => initializePartnerSignupMap(), 80);
    }
    if (pageId === "feed") loadFeedPosts();
    if (pageId === "community") {
        const currentTerm = document.getElementById("community-search-input")?.value || "";
        loadCommunityDirectory(currentTerm, true);
    }
    if (pageId === "profile") {
        updateGamificationUI();
        loadUserVouchers();
    }
    if (pageId === "achievements") {
        updateGamificationUI();
        loadApprovedPartnersSection();
    }
    if (pageId === "camera") requestCameraAccess();
    if (pageId === "partner-dashboard") renderPartnerDashboard();
    if (pageId === "admin") loadAdminDashboard();

    if (window.lucide) lucide.createIcons();
};

const updateNavButtons = (currentPage) => {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        const isActive = btn.dataset.page === currentPage;
        btn.classList.toggle("active-nav", isActive);
        btn.classList.toggle("text-verde-principal", isActive);
        btn.classList.toggle("text-gray-500", !isActive);
    });
};

const showLoadingModal = (show, message = "Carregando...") => {
    if (loadingMessage) loadingMessage.textContent = message;
    if (loadingModal) loadingModal.classList.toggle("hidden", !show);
};

let toastTimer = null;
const showToast = (message) => {
    const toast = document.getElementById("toast-notification");
    if (toast) {
        toast.querySelector("p").textContent = message;
        toast.classList.remove("hidden");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.add("hidden"), 5000);
    }
};

// --- 9. AUTENTICAÇÃO (GUARDIÃO E PARCEIRO) ---
const handleSignup = async (e) => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const errorMessageEl = document.getElementById("signup-error-message");

    if (name.length < 3 || name.length > 80) {
        errorMessageEl.textContent = "Por favor, insira um nome válido (entre 3 e 80 caracteres).";
        errorMessageEl.classList.remove("hidden");
        return;
    }

    const consentCheckbox = document.getElementById("signup-privacy-consent");
    if (consentCheckbox && !consentCheckbox.checked) {
        errorMessageEl.textContent = "Por favor, confirme o aviso de privacidade para continuar.";
        errorMessageEl.classList.remove("hidden");
        return;
    }

    showLoadingModal(true, "Criando sua conta de Guardião...");
    errorMessageEl.classList.add("hidden");
    appState.pendingAuthRole = "guardian";

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const newUserProfile = {
            name,
            email,
            role: "guardian",
            photoURL: `https://placehold.co/128x128/18981d/FFFFFF?text=${encodeURIComponent(name.charAt(0).toUpperCase())}`,
            isPublicProfile: true,
            privacyConsent: true,
            privacyConsentAt: serverTimestamp(),
            level: 1,
            levelName: LEVELS[0].name,
            points: 0,
            treesCared: 0,
            treesIdentified: 0,
            plantsIdentified: 0,
            treesAdded: 0,
            treesAdoptedCount: 0,
            commentsCount: 0,
            followingCount: 0,
            followersCount: 0,
            claimedMissions: [],
            unlockedEmblems: [],
            createdAt: serverTimestamp()
        };
        await setDoc(doc(db, "users", user.uid), newUserProfile);
        await syncPublicProfile(user.uid, newUserProfile);
    } catch (error) {
        console.error("Erro no cadastro:", error);
        errorMessageEl.textContent = getFirebaseErrorMessage(error);
        errorMessageEl.classList.remove("hidden");
    } finally {
        showLoadingModal(false);
    }
};

const handlePartnerSignup = async (e) => {
    e.preventDefault();
    const businessName = document.getElementById("partner-signup-name").value.trim();
    const category = document.getElementById("partner-signup-category").value;
    const address = document.getElementById("partner-signup-address").value.trim();
    const description = document.getElementById("partner-signup-description").value.trim();
    const email = document.getElementById("partner-signup-email").value.trim();
    const password = document.getElementById("partner-signup-password").value;
    const lat = parseFloat(document.getElementById("partner-signup-lat").value) || -22.9068;
    const lng = parseFloat(document.getElementById("partner-signup-lng").value) || -43.1729;
    const photoFile = document.getElementById("partner-signup-photo").files[0];
    const errorEl = document.getElementById("partner-signup-error-message");

    if (businessName.length < 2 || address.length < 5) {
        errorEl.textContent = "Preencha o nome do comércio e o endereço completo.";
        errorEl.classList.remove("hidden");
        return;
    }

    if (photoFile) {
        const check = validateImageFile(photoFile);
        if (!check.ok) {
            errorEl.textContent = check.error;
            errorEl.classList.remove("hidden");
            return;
        }
    }

    showLoadingModal(true, "Enviando solicitação de Parceiro...");
    errorEl.classList.add("hidden");
    appState.pendingAuthRole = "partner";

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        let photoURL = `https://placehold.co/240x180/0ea5e9/FFFFFF?text=${encodeURIComponent(businessName.substring(0, 12))}`;
        if (photoFile) {
            const uploaded = await uploadImage(photoFile, `partners/${user.uid}`);
            if (uploaded) photoURL = uploaded;
        }

        const newProfile = {
            name: businessName,
            email,
            role: "partner",
            photoURL,
            isPublicProfile: true,
            privacyConsent: true,
            privacyConsentAt: serverTimestamp(),
            level: 1,
            levelName: LEVELS[0].name,
            points: 0,
            treesCared: 0,
            treesIdentified: 0,
            plantsIdentified: 0,
            treesAdded: 0,
            treesAdoptedCount: 0,
            commentsCount: 0,
            followingCount: 0,
            followersCount: 0,
            claimedMissions: [],
            unlockedEmblems: [],
            createdAt: serverTimestamp()
        };
        await setDoc(doc(db, "users", user.uid), newProfile);
        await syncPublicProfile(user.uid, newProfile);

        await createInitialPartnerDocument(user.uid, email, {
            businessName,
            category,
            address,
            description,
            photoURL,
            lat,
            lng
        });

        showToast("Cadastro enviado! Aguarde a aprovação do administrador para aparecer no mapa. 🕓");
    } catch (error) {
        console.error("Erro no cadastro de parceiro:", error);
        errorEl.textContent = getFirebaseErrorMessage(error);
        errorEl.classList.remove("hidden");
    } finally {
        showLoadingModal(false);
    }
};

const createInitialPartnerDocument = async (uid, email, data) => {
    const partnerRef = doc(db, "partners", uid);
    const businessName = (data?.businessName || "Novo Comércio Parceiro").slice(0, 100);
    const partnerDoc = {
        ownerUid: uid,
        email: email || "",
        businessName,
        category: data?.category || "Comércio Local",
        address: (data?.address || "Endereço a informar").slice(0, 200),
        description: (data?.description || "Parceiro apoiador da arborização urbana no Rio.").slice(0, 500),
        photoURL: sanitizeUrl(
            data?.photoURL,
            `https://placehold.co/240x180/0ea5e9/FFFFFF?text=${encodeURIComponent(businessName.substring(0, 12))}`
        ),
        location: new GeoPoint(data?.lat || -22.9068, data?.lng || -43.1729),
        status: "pending",
        treesImpacted: 0,
        vouchersRedeemed: 0,
        createdAt: serverTimestamp()
    };
    await setDoc(partnerRef, partnerDoc);
    appState.currentPartnerDoc = { id: uid, ...partnerDoc };
};

const handlePartnerGoogleSignup = async () => {
    const businessName = document.getElementById("partner-signup-name")?.value.trim();
    const category = document.getElementById("partner-signup-category")?.value;
    const address = document.getElementById("partner-signup-address")?.value.trim();
    const description = document.getElementById("partner-signup-description")?.value.trim();
    const lat = parseFloat(document.getElementById("partner-signup-lat")?.value) || -22.9068;
    const lng = parseFloat(document.getElementById("partner-signup-lng")?.value) || -43.1729;

    appState.pendingAuthRole = "partner";
    appState.pendingPartnerSignupData = {
        businessName: businessName || "",
        category: category || "Comércio Local",
        address: address || "Informe seu endereço no painel",
        description: description || "Comércio local parceiro do Arboriza.",
        lat,
        lng
    };

    const provider = new GoogleAuthProvider();
    showLoadingModal(true, "Conectando conta de Parceiro com Google...");
    try {
        const result = await signInWithPopup(auth, provider);
        const uid = result.user.uid;
        const partnerSnap = await getDoc(doc(db, "partners", uid));
        if (!partnerSnap.exists()) {
            await updateDoc(doc(db, "users", uid), { role: "partner" }).catch(() => {});
            await createInitialPartnerDocument(uid, result.user.email, {
                ...appState.pendingPartnerSignupData,
                businessName: businessName || result.user.displayName || "Comércio Parceiro",
                photoURL: result.user.photoURL
            });
        }
    } catch (error) {
        console.error("Erro no Google Login Parceiro:", error);
        showToast(getFirebaseErrorMessage(error));
        showLoadingModal(false);
    }
};

const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorMessageEl = document.getElementById("login-error-message");

    showLoadingModal(true, "Entrando...");
    errorMessageEl.classList.add("hidden");

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Erro no login:", error);
        errorMessageEl.textContent = getFirebaseErrorMessage(error);
        errorMessageEl.classList.remove("hidden");
    } finally {
        showLoadingModal(false);
    }
};

const handleGoogleLogin = async () => {
    appState.pendingAuthRole = "guardian";
    const provider = new GoogleAuthProvider();
    showLoadingModal(true, "Conectando com Google...");
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Erro no Login Google:", error);
        showToast(getFirebaseErrorMessage(error));
        showLoadingModal(false);
    }
};

const handleForgotPassword = async (e) => {
    e.preventDefault();
    const email = document.getElementById("forgot-email").value.trim();
    showLoadingModal(true, "Enviando email...");
    try {
        await sendPasswordResetEmail(auth, email);
        document.getElementById("forgot-password-modal").classList.add("hidden");
        showToast("Email de redefinição enviado! Verifique sua caixa de entrada.");
    } catch (error) {
        console.error("Erro ao redefinir senha:", error);
        showToast(getFirebaseErrorMessage(error));
    } finally {
        showLoadingModal(false);
    }
};

const handleLogout = async () => {
    try {
        stopCameraStream();
        await signOut(auth);
    } catch (error) {
        console.error("Erro ao sair:", error);
        showToast("Erro ao tentar sair.");
    }
};

const getFirebaseErrorMessage = (error) => {
    switch (error.code) {
        case "auth/email-already-in-use": return "Este email já está em uso.";
        case "auth/invalid-email": return "Email inválido.";
        case "auth/weak-password": return "A senha precisa ter pelo menos 6 caracteres.";
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential": return "Email ou senha incorretos.";
        case "auth/configuration-not-found": return "Configuração de login não encontrada. (Ative Email/Senha no Firebase).";
        case "auth/popup-closed-by-user": return "Você fechou a janela do Google antes de terminar.";
        case "auth/unauthorized-domain": return "Este domínio não está autorizado para login. (Adicione-o no Firebase).";
        case "permission-denied": return "Permissão insuficiente no banco de dados. Atualize as Regras do Firebase.";
        default: return "Ocorreu um erro. Tente novamente.";
    }
};

// --- 10. GAMIFICAÇÃO, PRIVACIDADE, NÍVEIS, MISSÕES E EMBLEMAS ---
const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !appState.currentUser) return;

    const check = validateImageFile(file);
    if (!check.ok) {
        showToast(check.error);
        e.target.value = null;
        return;
    }

    showLoadingModal(true, "Atualizando sua foto...");
    try {
        const filePath = `user-avatars/${appState.currentUser.uid}/avatar_${Date.now()}.jpg`;
        const fileRef = ref(storage, filePath);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        await updateDoc(doc(db, "users", appState.currentUser.uid), { photoURL: downloadURL });
        appState.currentUser.photoURL = downloadURL;
        await syncPublicProfile(appState.currentUser.uid, appState.currentUser);

        document.getElementById("profile-avatar").src = downloadURL;
        showToast("Foto de perfil atualizada! ✨");
    } catch (error) {
        console.error("Erro ao atualizar foto de perfil:", error);
        showToast("Erro ao enviar sua foto. Verifique as regras do Storage.");
    } finally {
        showLoadingModal(false);
    }
};

const updatePrivacyToggleUI = () => {
    const toggle = document.getElementById("toggle-public-profile");
    const desc = document.getElementById("privacy-status-desc");
    if (!toggle || !appState.currentUser) return;

    const isPublic = appState.currentUser.isPublicProfile !== false;
    toggle.checked = isPublic;
    if (desc) {
        desc.textContent = isPublic
            ? "Outros guardiões podem encontrar e seguir seu perfil (seu e-mail continua privado)."
            : "Seu perfil está oculto da busca da Rede e não pode ser aberto por outros usuários.";
    }
};

const handleTogglePublicProfile = async (e) => {
    const user = appState.currentUser;
    if (!user) return;
    const wantPublic = e.target.checked;
    e.target.disabled = true;

    try {
        await updateDoc(doc(db, "users", user.uid), {
            isPublicProfile: wantPublic
        });
        user.isPublicProfile = wantPublic;

        if (wantPublic) {
            await syncPublicProfile(user.uid, user);
            showToast("Seu perfil agora aparece na busca da Rede! 🌐");
        } else {
            await deleteDoc(doc(db, "publicProfiles", user.uid));
            showToast("Perfil ocultado da Rede! 🔒");
        }

        appState.profilesLoadedOnce = false;
        updatePrivacyToggleUI();
    } catch (err) {
        console.error("Erro ao alterar privacidade:", err);
        e.target.checked = !wantPublic;
        showToast(getFirebaseErrorMessage(err));
    } finally {
        e.target.disabled = false;
    }
};

const awardPoints = async (action, extraPoints = 0) => {
    if (!appState.currentUser) return;

    const prevLevel = appState.currentUser.level || 1;
    const prevUnlocked = new Set(appState.currentUser.unlockedEmblems || []);
    let points = extraPoints;
    const updates = {};

    switch (action) {
        case "add_tree":
            points = 100;
            appState.currentUser.treesAdded = (appState.currentUser.treesAdded || 0) + 1;
            updates.treesAdded = appState.currentUser.treesAdded;
            break;
        case "care_tree":
            points = 50;
            appState.currentUser.treesCared = (appState.currentUser.treesCared || 0) + 1;
            updates.treesCared = appState.currentUser.treesCared;
            break;
        case "identify_tree":
            points = 15;
            appState.currentUser.treesIdentified = (appState.currentUser.treesIdentified || 0) + 1;
            updates.treesIdentified = appState.currentUser.treesIdentified;
            break;
        case "identify_plant":
            points = 5;
            appState.currentUser.plantsIdentified = (appState.currentUser.plantsIdentified || 0) + 1;
            updates.plantsIdentified = appState.currentUser.plantsIdentified;
            break;
        case "adopt_tree":
            points = 20;
            appState.currentUser.treesAdoptedCount = (appState.currentUser.treesAdoptedCount || 0) + 1;
            updates.treesAdoptedCount = appState.currentUser.treesAdoptedCount;
            break;
        case "comment_tree":
        case "comment_feed":
            points = 5;
            appState.currentUser.commentsCount = (appState.currentUser.commentsCount || 0) + 1;
            updates.commentsCount = appState.currentUser.commentsCount;
            break;
        case "mission_reward":
            points = extraPoints;
            break;
    }

    if (points > 0) {
        appState.currentUser.points = (Number(appState.currentUser.points) || 0) + points;
        const levelInfo = getLevelInfo(appState.currentUser.points);
        appState.currentUser.level = levelInfo.current.level;
        appState.currentUser.levelName = levelInfo.current.name;

        updates.points = appState.currentUser.points;
        updates.level = levelInfo.current.level;
        updates.levelName = levelInfo.current.name;

        // Verifica emblemas desbloqueados via múltiplas missões
        const newlyUnlocked = [];
        const allUnlocked = new Set(prevUnlocked);
        EMBLEMS.forEach(emblem => {
            if (getEmblemProgress(appState.currentUser, emblem).unlocked) {
                if (!allUnlocked.has(emblem.id)) {
                    newlyUnlocked.push(emblem.name);
                }
                allUnlocked.add(emblem.id);
            }
        });
        if (newlyUnlocked.length > 0) {
            appState.currentUser.unlockedEmblems = Array.from(allUnlocked);
            updates.unlockedEmblems = appState.currentUser.unlockedEmblems;
        }

        try {
            await updateDoc(doc(db, "users", appState.currentUser.uid), updates);
            await syncPublicProfile(appState.currentUser.uid, appState.currentUser);
        } catch (error) {
            console.error("Erro ao atualizar pontos no Firestore:", error);
        }

        if (levelInfo.current.level > prevLevel) {
            showToast(`🎉 Parabéns! Você subiu para ${levelInfo.current.name} ${levelInfo.current.emoji}`);
        } else if (newlyUnlocked.length > 0) {
            showToast(`🏆 Emblema desbloqueado: ${newlyUnlocked[0]}! (+${points} pts)`);
        } else {
            showToast(`+${points} pontos conquistados! 🍃`);
        }
    }

    updateGamificationUI();
};

const claimMissionReward = async (missionId) => {
    const user = appState.currentUser;
    if (!user) return;
    const mission = MISSIONS.find(m => m.id === missionId);
    if (!mission) return;

    const claimed = user.claimedMissions || [];
    if (claimed.includes(missionId)) {
        showToast("Você já resgatou os pontos desta missão!");
        return;
    }

    const currentVal = Number(user[mission.statKey]) || 0;
    if (currentVal < mission.goal) {
        showToast(`Faltam ${mission.goal - currentVal} para concluir esta missão!`);
        return;
    }

    showLoadingModal(true, "Resgatando recompensa da missão...");
    try {
        user.claimedMissions = [...claimed, missionId];
        await updateDoc(doc(db, "users", user.uid), {
            claimedMissions: arrayUnion(missionId)
        });
        await awardPoints("mission_reward", mission.rewardPoints);
        showToast(`✨ Missão "${mission.title}" concluída! +${mission.rewardPoints} pontos!`);
    } catch (err) {
        console.error("Erro ao resgatar missão:", err);
        showToast("Não foi possível resgatar a missão agora.");
    } finally {
        showLoadingModal(false);
    }
};

const updateGamificationUI = () => {
    const user = appState.currentUser;
    if (!user) return;

    const levelInfo = getLevelInfo(user.points || 0);
    const currentPoints = Number(user.points) || 0;

    const profileNameEl = document.getElementById("profile-name");
    const profileAvatarEl = document.getElementById("profile-avatar");
    const profileLevelEl = document.getElementById("profile-level");
    if (profileNameEl) profileNameEl.textContent = user.name || "Guardião";
    if (profileAvatarEl) {
        profileAvatarEl.src = sanitizeUrl(
            user.photoURL,
            `https://placehold.co/128x128/18981d/FFFFFF?text=${encodeURIComponent((user.name || "G").charAt(0))}`
        );
    }
    if (profileLevelEl) profileLevelEl.textContent = `${levelInfo.current.emoji} ${levelInfo.current.name}`;

    const pointsTextEl = document.getElementById("profile-points-text");
    const nextLevelTextEl = document.getElementById("profile-next-level-text");
    const progressBarEl = document.getElementById("profile-progress-bar");
    const progressTextEl = document.getElementById("profile-progress-text");

    if (pointsTextEl) pointsTextEl.textContent = currentPoints;
    if (nextLevelTextEl) {
        nextLevelTextEl.textContent = levelInfo.next
            ? `Próximo: ${levelInfo.next.name} (${levelInfo.next.minPoints} pts)`
            : "Nível Máximo Alcançado! 🌟";
    }
    if (progressBarEl) progressBarEl.style.width = `${levelInfo.progress}%`;
    if (progressTextEl) progressTextEl.textContent = `${Math.round(levelInfo.progress)}%`;

    const setStat = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setStat("profile-stat-cared", `🌳 ${user.treesCared || 0}`);
    setStat("profile-stat-identified", `🍃 ${user.treesIdentified || 0}`);
    setStat("profile-stat-added", `📍 ${user.treesAdded || 0}`);
    setStat("profile-stat-followers", user.followersCount || 0);
    setStat("profile-stat-following", user.followingCount || 0);

    updateRoleButtonsVisibility();
    updatePrivacyToggleUI();
    renderProfileEmblemsShowcase();
    loadAdoptedTreesForProfile();
    renderMissionsList();
    renderEmblemsList();
};

const renderProfileEmblemsShowcase = () => {
    const container = document.getElementById("profile-emblems-showcase");
    if (!container || !appState.currentUser) return;

    const unlocked = EMBLEMS.filter(e => getEmblemProgress(appState.currentUser, e).unlocked);
    if (unlocked.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 italic text-center w-full">Conclua conjuntos de missões na aba Conquistas para desbloquear emblemas! 🫧</p>`;
        return;
    }

    container.innerHTML = unlocked.map(e => `
        <div class="aero-badge-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold" title="${escapeHtml(e.description)}">
            <span>${e.emoji}</span>
            <span>${escapeHtml(e.name)}</span>
        </div>
    `).join("");
};

const renderMissionsList = () => {
    const container = document.getElementById("missions-list");
    if (!container || !appState.currentUser) return;

    const user = appState.currentUser;
    const claimed = user.claimedMissions || [];

    container.innerHTML = MISSIONS.map(mission => {
        const current = Number(user[mission.statKey]) || 0;
        const pct = Math.min((current / mission.goal) * 100, 100);
        const isCompleted = current >= mission.goal;
        const isClaimed = claimed.includes(mission.id);

        return `
            <div class="aero-card p-4">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <p class="font-extrabold text-slate-800 flex items-center gap-1.5">
                            <span>${mission.emoji}</span>
                            <span>${escapeHtml(mission.title)}</span>
                        </p>
                        <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(mission.description)}</p>
                    </div>
                    <span class="aero-points-chip text-xs font-bold whitespace-nowrap">+${mission.rewardPoints} pts</span>
                </div>
                <div class="mt-3">
                    <div class="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                        <span>Progresso</span>
                        <span>${Math.min(current, mission.goal)} / ${mission.goal}</span>
                    </div>
                    <div class="aero-progress-track">
                        <div class="aero-progress-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
                ${isCompleted && !isClaimed ? `
                    <button data-claim-mission="${mission.id}" class="btn-claim-mission frutiger-aero-button aero-green small w-full mt-3">
                        Resgatar +${mission.rewardPoints} Pontos 🫧
                    </button>
                ` : isClaimed ? `
                    <p class="text-xs font-bold text-emerald-700 mt-2 text-right">✅ Missão concluída e resgatada!</p>
                ` : ""}
            </div>
        `;
    }).join("");
};

const renderEmblemsList = () => {
    const container = document.getElementById("achievements-list");
    if (!container || !appState.currentUser) return;

    const user = appState.currentUser;
    container.innerHTML = EMBLEMS.map(emblem => {
        const prog = getEmblemProgress(user, emblem);

        return `
            <div data-achievement="${escapeHtml(emblem.name)}" class="aero-card p-4 ${prog.unlocked ? "border-emerald-400" : ""}">
                <div class="flex justify-between items-center gap-2">
                    <p class="font-extrabold text-slate-800 flex items-center gap-2">
                        <span class="text-xl">${emblem.emoji}</span>
                        <span>${escapeHtml(emblem.name)}</span>
                    </p>
                    <span class="counter text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${prog.unlocked ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}">
                        ${prog.unlocked ? "🏆 Desbloqueado" : `${prog.completedCount}/${prog.totalCount} missões`}
                    </span>
                </div>
                <p class="text-xs text-slate-600 mt-1">${escapeHtml(emblem.description)}</p>
                <div class="aero-progress-track mt-2.5">
                    <div class="progress-bar aero-progress-fill" style="width: ${prog.pct}%"></div>
                </div>
                <ul class="aero-emblem-checklist mt-3 space-y-1">
                    ${prog.details.map(item => `
                        <li class="text-xs flex items-center gap-1.5 ${item.done ? "text-emerald-800 font-bold" : "text-slate-600"}">
                            <span>${item.done ? "✅" : "⏳"}</span>
                            <span>${item.emoji} ${escapeHtml(item.title)}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    }).join("");
};

const loadAdoptedTreesForProfile = async () => {
    const listEl = document.getElementById("adopted-trees-list");
    if (!appState.currentUser || !listEl) return;

    listEl.innerHTML = `<p class="text-slate-500 text-center italic text-sm">Carregando árvores...</p>`;
    const q = query(collection(db, "users", appState.currentUser.uid, "adoptedTrees"), orderBy("adoptedAt", "desc"));

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            listEl.innerHTML = `<p class="text-slate-500 text-center italic text-sm">Nenhuma árvore adotada ainda.</p>`;
            return;
        }

        listEl.innerHTML = "";
        querySnapshot.forEach((docSnap) => {
            const tree = docSnap.data();
            const treeId = docSnap.id;
            const el = document.createElement("div");
            el.className = "aero-card p-3 flex items-center gap-3 cursor-pointer hover:scale-[1.01] transition-all";
            el.innerHTML = `
                <img src="${escapeHtml(sanitizeUrl(tree.coverPhoto, "https://placehold.co/60x60/22c55e/FFFFFF?text=🌳"))}" class="w-12 h-12 rounded-xl object-cover border border-white shadow">
                <div class="min-w-0">
                    <p class="font-bold text-emerald-800 truncate">${escapeHtml(tree.commonName)}</p>
                    <p class="text-xs text-slate-600 italic truncate">${escapeHtml(tree.scientificName)}</p>
                </div>
                <i data-lucide="chevron-right" class="ml-auto text-sky-600 flex-shrink-0"></i>
            `;
            el.addEventListener("click", () => showTreeProfile(treeId));
            listEl.appendChild(el);
        });
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("Erro ao carregar árvores adotadas:", error);
        listEl.innerHTML = `<p class="text-erro text-center text-sm">Erro ao carregar árvores.</p>`;
    }
};

const loadUserVouchers = async () => {
    const listEl = document.getElementById("profile-vouchers-list");
    if (!listEl || !appState.currentUser) return;

    listEl.innerHTML = `<p class="text-slate-500 text-center italic text-sm">Buscando seus vouchers...</p>`;
    try {
        const q = query(collection(db, "redemptions"), where("userId", "==", appState.currentUser.uid));
        const snap = await getDocs(q);
        if (snap.empty) {
            listEl.innerHTML = `<p class="text-slate-500 text-center italic text-sm">Nenhum voucher resgatado ainda. Explore os parceiros na aba Conquistas! 🍀</p>`;
            return;
        }
        const vouchers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.redeemedAt?.seconds || 0) - (a.redeemedAt?.seconds || 0));

        listEl.innerHTML = vouchers.map(v => `
            <div class="aero-card p-3 flex items-center justify-between gap-2">
                <div>
                    <p class="font-bold text-sm text-emerald-900">${escapeHtml(v.rewardTitle)}</p>
                    <p class="text-xs text-slate-600">🏪 ${escapeHtml(v.partnerName)}</p>
                    <p class="text-[11px] font-mono font-bold text-sky-800 mt-1">Código: ${escapeHtml(v.voucherCode)}</p>
                </div>
                <span class="text-xs font-bold px-2.5 py-1 rounded-full ${v.status === "used" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-800"}">
                    ${v.status === "used" ? "Utilizado" : "Válido 🎟️"}
                </span>
            </div>
        `).join("");
    } catch (err) {
        console.error("Erro ao carregar vouchers:", err);
        listEl.innerHTML = `<p class="text-xs text-erro text-center">${escapeHtml(getFirebaseErrorMessage(err))}</p>`;
    }
};

// --- 11. MAPA PRINCIPAL DE ÁRVORES E FIREBASE ---
const promptForLocation = () => {
    if (appState.locationPermissionGranted) {
        showPage("map");
        initializeMap();
        centerMapOnUserLocation();
        return;
    }

    const modal = document.getElementById("location-permission-modal");
    modal.classList.remove("hidden");

    document.getElementById("btn-grant-location").onclick = async () => {
        modal.classList.add("hidden");
        showLoadingModal(true, "Achando sua localização...");

        try {
            const position = await getCurrentLocation();
            appState.lastUserLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            appState.locationPermissionGranted = true;
            showPage("map");
            initializeMap();
        } catch (error) {
            console.error("Erro de Geolocalização:", error);
            showToast("Não foi possível obter sua localização. O mapa será centralizado no Rio.");
            appState.lastUserLocation = { latitude: -22.9068, longitude: -43.1729 };
            appState.locationPermissionGranted = false;
            showPage("map");
            initializeMap();
        } finally {
            showLoadingModal(false);
        }
    };
};

const getCurrentLocation = (options = { timeout: 10000, enableHighAccuracy: true }) => {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            return reject(new Error("Geolocalização não suportada."));
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
};

const initializeMap = () => {
    if (appState.map) {
        appState.map.invalidateSize();
        return;
    }

    const initialLat = appState.lastUserLocation?.latitude || -22.9068;
    const initialLng = appState.lastUserLocation?.longitude || -43.1729;

    appState.map = L.map("map-container", {
        zoomControl: false,
        maxZoom: 22
    }).setView([initialLat, initialLng], 17);

    L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        maxZoom: 22,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "Map data &copy; Google"
    }).addTo(appState.map);

    L.control.zoom({ position: "topright" }).addTo(appState.map);

    appState.userMarker = L.marker([initialLat, initialLng], { draggable: true })
        .addTo(appState.map)
        .bindPopup("Arraste o pino ou clique no mapa! 📍")
        .openPopup();

    appState.userMarker.on("dragend", function (event) {
        const position = event.target.getLatLng();
        appState.lastUserLocation = { latitude: position.lat, longitude: position.lng };
        appState.userMarker.bindPopup("Local escolhido! 📍").openPopup();
    });

    appState.map.on("click", function (event) {
        const elementoClicado = event.originalEvent.target;
        if (elementoClicado.closest("button") || elementoClicado.closest(".modal-content") || elementoClicado.closest("nav")) {
            return;
        }
        const novaPosicao = event.latlng;
        appState.userMarker.setLatLng(novaPosicao);
        appState.lastUserLocation = { latitude: novaPosicao.lat, longitude: novaPosicao.lng };
        appState.userMarker.bindPopup("Novo local escolhido! 📍").openPopup();
    });

    loadTreesOnMap();
};

const centerMapOnUserLocation = async () => {
    if (appState.locationPermissionGranted && appState.lastUserLocation) {
        appState.map.setView([appState.lastUserLocation.latitude, appState.lastUserLocation.longitude], 18);
        if (appState.userMarker) {
            appState.userMarker.setLatLng([appState.lastUserLocation.latitude, appState.lastUserLocation.longitude]).openPopup();
        }
    } else {
        promptForLocation();
    }
};

const addTreeMarkerToMap = (tree) => {
    if (!tree.location || !appState.map) return;

    const rawLat = tree.location.latitude ?? tree.location.lat ?? tree.location._lat;
    const rawLng = tree.location.longitude ?? tree.location.lng ?? tree.location._long;
    let lat = parseFloat(rawLat);
    let lng = parseFloat(rawLng);
    if (isNaN(lat) || isNaN(lng)) return;

    const pseudoRandom = tree.id.charCodeAt(0) + (tree.id.length * 5);
    const offsetLat = ((pseudoRandom % 10) - 5) * (0.00015 / 5);
    const offsetLng = ((pseudoRandom % 8) - 4) * (0.00015 / 4);
    lat += offsetLat;
    lng += offsetLng;

    const latLng = [lat, lng];
    if (appState.treeMarkers[tree.id]) {
        appState.treeMarkers[tree.id].setLatLng(latLng);
        return;
    }

    let iconUrl;
    switch (tree.status) {
        case "healthy": iconUrl = "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png"; break;
        case "needs-care": iconUrl = "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png"; break;
        case "critical": iconUrl = "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png"; break;
        default: iconUrl = "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png";
    }

    const treeIcon = L.icon({
        iconUrl,
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    const marker = L.marker(latLng, { icon: treeIcon });
    marker.on("click", () => showTreeProfile(tree.id));
    marker.addTo(appState.map);
    appState.treeMarkers[tree.id] = marker;
};

const loadTreesOnMap = () => {
    if (appState.treesMapUnsubscriber) appState.treesMapUnsubscriber();
    const q = query(collection(db, "trees"));
    appState.treesMapUnsubscriber = onSnapshot(q, (querySnapshot) => {
        querySnapshot.forEach((docSnap) => {
            try {
                const tree = { id: docSnap.id, ...docSnap.data() };
                addTreeMarkerToMap(tree);
            } catch (err) {
                console.error("Erro ao processar árvore:", docSnap.id, err);
            }
        });
    }, (error) => {
        console.error("Erro geral no Snapshot das árvores:", error);
    });
};

// --- 12. PERFIL DA ÁRVORE, ADOÇÃO E MURAL ---
const showTreeProfile = async (treeId) => {
    showLoadingModal(true, "Carregando árvore...");
    clearTreeSubcollectionListeners();

    try {
        const docRef = doc(db, "trees", treeId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error("Árvore não encontrada");

        appState.currentTree = { id: docSnap.id, ...docSnap.data() };
        const tree = appState.currentTree;

        document.getElementById("tree-profile-name").textContent = tree.commonName || "Nome não definido";
        document.getElementById("tree-profile-scientific-name").textContent = tree.scientificName || "";

        const typeBadge = document.getElementById("tree-profile-type-badge");
        if (typeBadge) {
            typeBadge.textContent = tree.isTree === false ? "🌿 Planta / Arbusto" : "🌳 Árvore Urbana";
        }

        let locText = "Localização não disponível";
        if (tree.location) {
            const lat = tree.location.latitude ?? tree.location.lat;
            const lng = tree.location.longitude ?? tree.location.lng;
            if (lat && lng) locText = `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
        }
        document.getElementById("tree-profile-address").querySelector("span").textContent = tree.address || locText;
        document.getElementById("tree-profile-image").src = sanitizeUrl(tree.coverPhoto, "https://placehold.co/600x300/22c55e/FFFFFF?text=Árvore");

        const statusBadge = document.getElementById("tree-profile-status-badge");
        if (tree.status === "healthy") {
            statusBadge.className = "aero-status-healthy text-center font-bold p-2.5 rounded-xl my-4";
            statusBadge.textContent = "💚 Saudável e Feliz";
        } else if (tree.status === "needs-care") {
            statusBadge.className = "aero-status-warning text-center font-bold p-2.5 rounded-xl my-4";
            statusBadge.textContent = "💛 Precisa de Cuidado";
        } else {
            statusBadge.className = "aero-status-critical text-center font-bold p-2.5 rounded-xl my-4";
            statusBadge.textContent = "❤️ Em Estado Crítico";
        }

        document.getElementById("tree-comment-photo-preview-container").classList.add("hidden");
        document.getElementById("tree-comment-photo-preview").src = "";
        document.getElementById("tree-comment-photo-input").value = null;
        const commentLabel = document.getElementById("comment-media-label");
        if (commentLabel) {
            commentLabel.innerText = "Adicionar Foto";
            commentLabel.classList.remove("text-verde-principal", "font-bold");
        }

        loadTreeSubcollection(treeId, "careEvents", "tree-profile-history", renderHistoryEvent);
        loadTreeSubcollection(treeId, "careEvents", "tree-profile-timeline", renderTimelineEvent, true);
        loadTreeSubcollection(treeId, "adopters", "tree-profile-adopters", renderAdopter);

        checkAdoptionStatus(treeId);
        showPage("tree-profile");
    } catch (error) {
        console.error("Erro ao carregar perfil da árvore:", error);
        showToast("Não foi possível carregar os detalhes desta árvore.");
    } finally {
        showLoadingModal(false);
    }
};

const loadTreeSubcollection = (treeId, subcollection, containerId, renderFunction, filterByMessageOrPhoto = false) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<p class="text-slate-500 text-sm">Carregando...</p>`;

    let q = query(collection(db, "trees", treeId, subcollection));
    if (subcollection === "careEvents") {
        q = query(q, orderBy("timestamp", "desc"));
    }

    const unsub = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = `<p class="text-slate-500 text-sm text-center italic">Nada por aqui ainda.</p>`;
            return;
        }

        container.innerHTML = "";
        let itemsFound = 0;

        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            if (filterByMessageOrPhoto && !item.message && !item.photoUrl) return;
            container.innerHTML += renderFunction(item);
            itemsFound++;
        });

        if (itemsFound === 0 && filterByMessageOrPhoto) {
            container.innerHTML = `<p class="text-slate-500 text-sm text-center italic">Ainda não há mensagens ou fotos. Seja o primeiro a deixar uma memória! 💬</p>`;
        }
        if (window.lucide) lucide.createIcons();
    }, (error) => {
        console.error(`Erro ao carregar ${subcollection}:`, error);
        container.innerHTML = `<p class="text-erro text-sm">Erro ao carregar dados.</p>`;
    });

    appState.activeTreeUnsubscribers.push(unsub);
};

const renderHistoryEvent = (event) => {
    if (!event || !event.user || !event.action) return "";
    const eventDate = formatDateBR(event.timestamp);
    return `<div class="p-1.5 border-b border-sky-100"><span class="font-semibold text-sky-900">${eventDate}:</span> ${escapeHtml(event.user.name || "Alguém")} ${escapeHtml(event.action)}</div>`;
};

const renderTimelineEvent = (event) => {
    if (!event || !event.user) return "";
    const eventDate = formatDateBR(event.timestamp);
    const isFirst = (event.action || "").includes("cadastrou");
    const avatarUrl = sanitizeUrl(event.user.photoURL, "https://placehold.co/32x32/0ea5e9/FFFFFF?text=?");
    const photoUrl = sanitizeUrl(event.photoUrl, "");

    return `
        <div class="aero-card p-3.5 fade-in relative">
            <div class="flex items-center mb-2">
                <img src="${escapeHtml(avatarUrl)}" class="w-8 h-8 rounded-full object-cover border border-white shadow-sm cursor-pointer btn-open-user-profile" data-uid="${escapeHtml(event.user.id || "")}">
                <button type="button" class="ml-2 font-bold text-slate-800 text-xs hover:underline btn-open-user-profile" data-uid="${escapeHtml(event.user.id || "")}">${escapeHtml(event.user.name || "Anônimo")}</button>
                <p class="ml-auto text-[10px] text-slate-500">${eventDate}</p>
            </div>
            ${event.message ? `<p class="text-sm text-slate-700 leading-relaxed">"${escapeHtml(event.message)}"</p>` : ""}
            ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" class="w-full h-auto rounded-xl object-cover mt-2 border border-white shadow">` : ""}
            ${isFirst ? '<span class="absolute -top-2 -right-2 text-[10px] aero-badge-pill px-2.5 py-0.5 font-bold shadow">✨ Primeira Mensagem</span>' : ""}
        </div>`;
};

const renderAdopter = (adopter) => {
    if (!adopter) return "";
    const avatarUrl = sanitizeUrl(adopter.photoURL, "https://placehold.co/16x16/0ea5e9/FFFFFF?text=?");
    return `<span class="aero-badge-pill text-xs font-semibold px-2.5 py-1 flex items-center gap-1.5">
                <img src="${escapeHtml(avatarUrl)}" class="w-4 h-4 rounded-full object-cover">
                ${escapeHtml(adopter.name || "Alguém")}
            </span>`;
};

const checkAdoptionStatus = async (treeId) => {
    const btn = document.getElementById("btn-adopt-tree");
    const user = appState.currentUser;
    if (!user || !btn) return;

    const adoptRef = doc(db, "trees", treeId, "adopters", user.uid);
    const docSnap = await getDoc(adoptRef);

    if (docSnap.exists()) {
        btn.classList.add("text-red-700");
        btn.classList.remove("text-emerald-800");
        btn.innerHTML = `<i data-lucide="heart-off" class="w-4 h-4"></i><span>Remover</span>`;
    } else {
        btn.classList.remove("text-red-700");
        btn.classList.add("text-emerald-800");
        btn.innerHTML = `<i data-lucide="heart" class="w-4 h-4"></i><span>Adotar</span>`;
    }
    if (window.lucide) lucide.createIcons();
};

const handleAdoptTree = async () => {
    const tree = appState.currentTree;
    const user = appState.currentUser;
    if (!tree || !user) return;

    const btn = document.getElementById("btn-adopt-tree");
    btn.disabled = true;

    const treeAdoptRef = doc(db, "trees", tree.id, "adopters", user.uid);
    const userAdoptRef = doc(db, "users", user.uid, "adoptedTrees", tree.id);

    try {
        const docSnap = await getDoc(treeAdoptRef);
        if (docSnap.exists()) {
            await deleteDoc(treeAdoptRef);
            await deleteDoc(userAdoptRef);
            user.treesAdoptedCount = Math.max(0, (user.treesAdoptedCount || 1) - 1);
            await updateDoc(doc(db, "users", user.uid), { treesAdoptedCount: user.treesAdoptedCount });
            await syncPublicProfile(user.uid, user);
            showToast(`${tree.commonName} removida das adoções.`);
        } else {
            await setDoc(treeAdoptRef, {
                name: user.name,
                photoURL: user.photoURL,
                adoptedAt: serverTimestamp()
            });
            await setDoc(userAdoptRef, {
                commonName: tree.commonName,
                scientificName: tree.scientificName,
                coverPhoto: tree.coverPhoto || "",
                adoptedAt: serverTimestamp()
            });
            showToast(`Você adotou a ${tree.commonName}! 💚`);
            await awardPoints("adopt_tree");
        }
        checkAdoptionStatus(tree.id);
    } catch (error) {
        console.error("Erro ao adotar/desadotar:", error);
        showToast("Ocorreu um erro.");
    } finally {
        btn.disabled = false;
    }
};

// --- 13. CONFIRMAÇÃO ANTES DE PUBLICAR NO FEED + POSTAGEM ---
const askFeedPublishConfirmation = (previewText, previewPhotoUrl = null) => {
    return new Promise((resolve) => {
        const modal = document.getElementById("feed-publish-confirm-modal");
        const textEl = document.getElementById("feed-confirm-preview-text");
        const imgEl = document.getElementById("feed-confirm-preview-img");

        if (!modal) {
            resolve(false);
            return;
        }

        textEl.textContent = previewText || "Compartilhar esta atualização com a comunidade Arboriza?";
        if (previewPhotoUrl) {
            imgEl.src = previewPhotoUrl;
            imgEl.classList.remove("hidden");
        } else {
            imgEl.src = "";
            imgEl.classList.add("hidden");
        }

        modal.classList.remove("hidden");
        appState.pendingFeedPublishResolver = resolve;
    });
};

const publishPostToCommunityFeed = async ({ treeId, treeName, action, message, photoUrl, careEventId = null }) => {
    if (!appState.currentUser) return;
    await addDoc(collection(db, "feedPosts"), {
        treeId: treeId || null,
        treeName: String(treeName || "Árvore Urbana").slice(0, 120),
        careEventId,
        action: String(action || "atualizou uma árvore").slice(0, 160),
        message: String(message || "").slice(0, 1000),
        photoUrl: photoUrl || null,
        user: {
            id: appState.currentUser.uid,
            name: appState.currentUser.name,
            photoURL: appState.currentUser.photoURL
        },
        likedBy: [],
        commentsCount: 0,
        timestamp: serverTimestamp()
    });
};

const handlePostComment = async () => {
    const tree = appState.currentTree;
    const user = appState.currentUser;
    const input = document.getElementById("tree-comment-input");
    const photoInput = document.getElementById("tree-comment-photo-input");
    const previewContainer = document.getElementById("tree-comment-photo-preview-container");
    const previewImg = document.getElementById("tree-comment-photo-preview");

    const message = input.value.trim().slice(0, 1000);
    const photoFile = photoInput.files[0];

    if (!tree || !user || (!message && !photoFile)) {
        showToast("Escreva uma mensagem ou anexe uma foto!");
        return;
    }

    if (photoFile) {
        const check = validateImageFile(photoFile);
        if (!check.ok) {
            showToast(check.error);
            return;
        }
    }

    const previewPhotoLocal = photoFile ? URL.createObjectURL(photoFile) : null;
    const shouldPublishToFeed = await askFeedPublishConfirmation(
        `Publicar seu comentário sobre "${tree.commonName}" no Feed da Galera?\n\n"${message || "Registro fotográfico"}"`,
        previewPhotoLocal
    );

    const btn = document.getElementById("btn-post-comment");
    btn.disabled = true;
    showLoadingModal(true, "Postando no mural...");

    try {
        let photoUrl = null;
        if (photoFile) {
            photoUrl = await uploadImage(photoFile, "comment_photos");
        }

        const commentEvent = {
            action: "comentou.",
            message: message || "",
            photoUrl,
            publishToFeed: shouldPublishToFeed,
            user: {
                id: user.uid,
                name: user.name,
                photoURL: user.photoURL
            },
            timestamp: serverTimestamp()
        };

        const eventRef = await addDoc(collection(db, "trees", tree.id, "careEvents"), commentEvent);

        if (shouldPublishToFeed) {
            await publishPostToCommunityFeed({
                treeId: tree.id,
                treeName: tree.commonName,
                action: `comentou em ${tree.commonName}`,
                message,
                photoUrl,
                careEventId: eventRef.id
            });
        }

        await awardPoints("comment_tree");

        input.value = "";
        photoInput.value = null;
        previewImg.src = "";
        previewContainer.classList.add("hidden");
        const label = document.getElementById("comment-media-label");
        if (label) {
            label.innerText = "Adicionar Foto";
            label.classList.remove("text-verde-principal", "font-bold");
        }

        showToast(shouldPublishToFeed ? "Mensagem publicada no mural e no Feed! 🌍" : "Mensagem salva no mural da árvore! 💬");
    } catch (error) {
        console.error("Erro ao postar comentário:", error);
        showToast("Erro ao enviar sua mensagem.");
    } finally {
        if (previewPhotoLocal) URL.revokeObjectURL(previewPhotoLocal);
        btn.disabled = false;
        showLoadingModal(false);
    }
};

// --- 14. FLUXO DE CUIDADO E UPLOAD SEGURO ---
const uploadImage = async (file, folder = "photos") => {
    if (!file) return null;
    const check = validateImageFile(file);
    if (!check.ok) {
        showToast(check.error);
        return null;
    }

    const safeName = (file.name || "imagem.jpg").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
    const filePath = `${folder}/${Date.now()}_${safeName}`;
    const fileRef = ref(storage, filePath);

    try {
        const snapshot = await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
        return await getDownloadURL(snapshot.ref);
    } catch (error) {
        console.error("Erro no upload da imagem:", error);
        showToast("Erro ao enviar a foto. Verifique as permissões do Storage.");
        return null;
    }
};

const handleFinishCare = async () => {
    const tree = appState.currentTree;
    const user = appState.currentUser;
    if (!tree || !user) return;

    const message = document.getElementById("care-message").value.trim().slice(0, 1000);
    const photoFile = document.getElementById("care-photo-input").files[0];

    if (photoFile) {
        const check = validateImageFile(photoFile);
        if (!check.ok) {
            showToast(check.error);
            return;
        }
    }

    const previewPhotoLocal = photoFile ? URL.createObjectURL(photoFile) : null;
    const shouldPublishToFeed = await askFeedPublishConfirmation(
        `Publicar seu cuidado com "${tree.commonName}" no Feed da Galera?\n\n${message ? `"${message}"` : "Registro de cuidado ambiental 💧"}`,
        previewPhotoLocal
    );

    showLoadingModal(true, "Registrando seu cuidado...");
    try {
        const photoUrl = await uploadImage(photoFile, "photos");
        const careEvent = {
            action: "cuidou da planta.",
            message: message || "",
            photoUrl: photoUrl || null,
            publishToFeed: shouldPublishToFeed,
            user: {
                id: user.uid,
                name: user.name,
                photoURL: user.photoURL
            },
            timestamp: serverTimestamp()
        };

        const eventRef = await addDoc(collection(db, "trees", tree.id, "careEvents"), careEvent);

        if (shouldPublishToFeed) {
            await publishPostToCommunityFeed({
                treeId: tree.id,
                treeName: tree.commonName,
                action: `cuidou de ${tree.commonName}`,
                message: message || "Mais um cuidado registrado para refrescar nossa cidade! 💧🌳",
                photoUrl,
                careEventId: eventRef.id
            });
        }

        await awardPoints("care_tree");
        showToast(shouldPublishToFeed ? "Cuidado registrado e publicado no Feed! 🌳🌍" : "Cuidado registrado com sucesso! 🌳");
        showPage("tree-profile");

        document.getElementById("care-message").value = "";
        document.getElementById("care-photo-input").value = null;
        document.getElementById("care-confirmation-section").classList.add("hidden");
        document.getElementById("care-media-label").innerText = "Anexar Foto do Cuidado";
    } catch (error) {
        console.error("Erro ao finalizar cuidado:", error);
        showToast("Ocorreu um erro ao registrar o seu cuidado.");
    } finally {
        if (previewPhotoLocal) URL.revokeObjectURL(previewPhotoLocal);
        showLoadingModal(false);
    }
};

// --- 15. FEED SOCIAL INTERATIVO ---
const loadFeedPosts = async () => {
    const feedContainer = document.getElementById("feed-posts-container");
    if (!feedContainer) return;
    feedContainer.innerHTML = `<p class="text-center text-slate-500 py-6">Carregando o feed da galera... 🫧</p>`;

    try {
        const posts = [];
        const coveredCareEventIds = new Set();

        // 1. Publicações oficiais v2+
        try {
            const feedQuery = query(collection(db, "feedPosts"), orderBy("timestamp", "desc"), limit(30));
            const feedSnap = await getDocs(feedQuery);
            feedSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.careEventId) coveredCareEventIds.add(data.careEventId);
                posts.push({ id: docSnap.id, collectionPath: "feedPosts", ...data });
            });
        } catch (feedErr) {
            console.warn("Aviso ao ler feedPosts:", feedErr);
        }

        // 2. Preserva registros legados já cadastrados
        try {
            const legacyQuery = query(collectionGroup(db, "careEvents"), orderBy("timestamp", "desc"), limit(15));
            const legacySnap = await getDocs(legacyQuery);
            legacySnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.publishToFeed === false) return;
                if (coveredCareEventIds.has(docSnap.id)) return;
                if (!data.photoUrl && !data.message) return;

                const treeId = docSnap.ref.parent?.parent?.id || null;
                posts.push({
                    id: docSnap.id,
                    docPath: docSnap.ref.path,
                    collectionPath: "legacy",
                    treeId,
                    treeName: data.treeName || "Árvore da Comunidade",
                    likedBy: data.likedBy || [],
                    commentsCount: data.commentsCount || 0,
                    ...data
                });
            });
        } catch (legacyErr) {
            console.warn("Feed legado opcional indisponível:", legacyErr);
        }

        posts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        const filteredPosts = appState.feedFilter === "following"
            ? posts.filter(p => p.user?.id === appState.currentUser?.uid || appState.followingIds.has(p.user?.id))
            : posts;

        if (filteredPosts.length === 0) {
            feedContainer.innerHTML = appState.feedFilter === "following"
                ? `<div class="aero-card p-6 text-center"><p class="text-slate-600 text-sm">Nenhuma publicação de quem você segue ainda. Busque guardiões na aba <strong>Rede</strong>! 🌐</p></div>`
                : `<div class="aero-card p-6 text-center"><p class="text-slate-600 text-sm italic">O feed está quieto... Seja o primeiro a cuidar de uma árvore e compartilhar! 🌳</p></div>`;
            return;
        }

        feedContainer.innerHTML = filteredPosts.map(post => renderFeedPostCard(post)).join("");
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("Não foi possível carregar o feed:", error);
        feedContainer.innerHTML = `<p class="text-erro text-center text-sm">${escapeHtml(getFirebaseErrorMessage(error))}</p>`;
    }
};

const renderFeedPostCard = (post) => {
    const uid = appState.currentUser?.uid;
    const likedBy = post.likedBy || [];
    const isLiked = uid && likedBy.includes(uid);
    const isLegacy = post.collectionPath === "legacy";
    const postKey = isLegacy ? `legacy::${post.docPath}` : `feed::${post.id}`;
    const avatarUrl = sanitizeUrl(post.user?.photoURL, "https://placehold.co/40x40/0ea5e9/FFFFFF?text=G");
    const photoUrl = sanitizeUrl(post.photoUrl, "");

    return `
        <article class="aero-card p-4 fade-in" data-post-key="${escapeHtml(postKey)}">
            <div class="flex items-center gap-2.5 mb-2.5">
                <img src="${escapeHtml(avatarUrl)}"
                     class="w-10 h-10 rounded-full object-cover border-2 border-white shadow cursor-pointer btn-open-user-profile"
                     data-uid="${escapeHtml(post.user?.id || "")}">
                <div class="min-w-0 flex-grow">
                    <button type="button" class="font-bold text-sm text-slate-800 hover:text-sky-700 truncate block btn-open-user-profile" data-uid="${escapeHtml(post.user?.id || "")}">
                        ${escapeHtml(post.user?.name || "Guardião")}
                    </button>
                    <p class="text-[11px] text-slate-500">${escapeHtml(post.action || "registrou uma ação")} • ${formatDateBR(post.timestamp)}</p>
                </div>
                ${post.treeId ? `
                    <button type="button" class="aero-badge-pill text-[11px] px-2.5 py-1 font-bold btn-open-tree-from-feed flex-shrink-0" data-tree-id="${escapeHtml(post.treeId)}">
                        🌳 Ver árvore
                    </button>
                ` : ""}
            </div>

            ${post.message ? `<p class="text-sm text-slate-700 mb-2.5 leading-relaxed">${escapeHtml(post.message)}</p>` : ""}
            ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" class="w-full max-h-80 rounded-xl object-cover border border-white shadow-sm mb-3">` : ""}

            <div class="flex items-center gap-3 pt-2 border-t border-sky-100">
                <button type="button" class="btn-like-post flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition ${isLiked ? "bg-rose-100 text-rose-700" : "bg-white/70 text-slate-600 hover:bg-sky-50"}"
                        data-post-key="${escapeHtml(postKey)}">
                    <span>${isLiked ? "💚" : "🤍"}</span>
                    <span class="like-count">${likedBy.length}</span>
                    <span>Curtir</span>
                </button>
                <button type="button" class="btn-toggle-comments flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/70 text-slate-600 hover:bg-sky-50 transition"
                        data-post-key="${escapeHtml(postKey)}">
                    <span>💬</span>
                    <span class="comment-count">${post.commentsCount || 0}</span>
                    <span>Comentar</span>
                </button>
            </div>

            <div class="feed-comments-drawer hidden mt-3 pt-3 border-t border-sky-100 space-y-2" data-drawer-for="${escapeHtml(postKey)}">
                <div class="feed-comments-list space-y-1.5 text-xs text-slate-700"></div>
                <div class="flex gap-2 mt-2">
                    <input type="text" maxlength="500" class="feed-comment-input flex-grow p-2 text-xs rounded-lg border border-sky-200 bg-white/90" placeholder="Escreva um comentário carinhoso...">
                    <button type="button" class="btn-send-feed-comment frutiger-aero-button aero-green small text-xs px-3 py-1.5" data-post-key="${escapeHtml(postKey)}">Enviar</button>
                </div>
            </div>
        </article>
    `;
};

const resolvePostDocRef = (postKey) => {
    if (postKey.startsWith("feed::")) {
        return doc(db, "feedPosts", postKey.replace("feed::", ""));
    }
    if (postKey.startsWith("legacy::")) {
        const parts = postKey.replace("legacy::", "").split("/");
        return doc(db, ...parts);
    }
    return null;
};

const handleToggleLikePost = async (btn, postKey) => {
    const user = appState.currentUser;
    if (!user) return;
    const postRef = resolvePostDocRef(postKey);
    if (!postRef) return;

    btn.disabled = true;
    try {
        const snap = await getDoc(postRef);
        const likedBy = snap.data()?.likedBy || [];
        const alreadyLiked = likedBy.includes(user.uid);

        await updateDoc(postRef, {
            likedBy: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
        });

        const newCount = alreadyLiked ? Math.max(0, likedBy.length - 1) : likedBy.length + 1;
        btn.querySelector(".like-count").textContent = newCount;
        btn.querySelector("span:first-child").textContent = alreadyLiked ? "🤍" : "💚";
        btn.classList.toggle("bg-rose-100", !alreadyLiked);
        btn.classList.toggle("text-rose-700", !alreadyLiked);
    } catch (err) {
        console.error("Erro ao curtir:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        btn.disabled = false;
    }
};

const handleToggleCommentsDrawer = async (postKey, articleEl) => {
    const drawer = articleEl.querySelector(".feed-comments-drawer");
    if (!drawer) return;
    const isHidden = drawer.classList.toggle("hidden");
    if (!isHidden) {
        await loadPostComments(postKey, drawer.querySelector(".feed-comments-list"));
    }
};

const loadPostComments = async (postKey, listEl) => {
    const postRef = resolvePostDocRef(postKey);
    if (!postRef || !listEl) return;

    listEl.innerHTML = `<p class="text-slate-400 italic">Carregando comentários...</p>`;
    try {
        const q = query(collection(postRef, "comments"), orderBy("timestamp", "asc"));
        const snap = await getDocs(q);
        if (snap.empty) {
            listEl.innerHTML = `<p class="text-slate-400 italic">Seja o primeiro a comentar! 💬</p>`;
            return;
        }
        listEl.innerHTML = snap.docs.map(d => {
            const c = d.data();
            const avatarUrl = sanitizeUrl(c.user?.photoURL, "https://placehold.co/24x24/0ea5e9/FFFFFF?text=G");
            return `
                <div class="bg-white/80 p-2 rounded-lg border border-sky-100 flex items-start gap-2">
                    <img src="${escapeHtml(avatarUrl)}" class="w-6 h-6 rounded-full object-cover flex-shrink-0">
                    <div>
                        <span class="font-bold text-slate-800">${escapeHtml(c.user?.name || "Guardião")}</span>
                        <span class="text-[10px] text-slate-400 ml-1">${formatDateBR(c.timestamp)}</span>
                        <p class="text-slate-700 mt-0.5">${escapeHtml(c.text)}</p>
                    </div>
                </div>
            `;
        }).join("");
    } catch (err) {
        console.error("Erro ao carregar comentários do feed:", err);
        listEl.innerHTML = `<p class="text-erro">Erro ao carregar comentários.</p>`;
    }
};

const handleSendFeedComment = async (postKey, articleEl) => {
    const user = appState.currentUser;
    if (!user) return;
    const input = articleEl.querySelector(".feed-comment-input");
    const text = input?.value.trim().slice(0, 500);
    if (!text) return;

    const postRef = resolvePostDocRef(postKey);
    if (!postRef) return;

    input.disabled = true;
    try {
        await addDoc(collection(postRef, "comments"), {
            text,
            user: { id: user.uid, name: user.name, photoURL: user.photoURL },
            timestamp: serverTimestamp()
        });
        await updateDoc(postRef, { commentsCount: increment(1) }).catch(() => {});

        const countEl = articleEl.querySelector(".comment-count");
        if (countEl) countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1;

        input.value = "";
        await loadPostComments(postKey, articleEl.querySelector(".feed-comments-list"));
        await awardPoints("comment_feed");
    } catch (err) {
        console.error("Erro ao comentar no feed:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        input.disabled = false;
    }
};

// --- 16. COMUNIDADE: BUSCAR PERFIS PÚBLICOS E CONECTAR (SEGUIR) ---
const loadCommunityDirectory = async (searchTerm = "", forceRefresh = false) => {
    const listEl = document.getElementById("community-users-list");
    if (!listEl || !appState.currentUser) return;

    const folEl = document.getElementById("community-following-count");
    const flwEl = document.getElementById("community-followers-count");
    if (folEl) folEl.textContent = appState.followingIds.size;
    if (flwEl) flwEl.textContent = appState.currentUser.followersCount || 0;

    try {
        if (!appState.profilesLoadedOnce || forceRefresh) {
            listEl.innerHTML = `<p class="text-center text-slate-500 py-4 text-sm">Buscando guardiões na rede... 🌐</p>`;
            const snap = await getDocs(collection(db, "publicProfiles"));
            appState.cachedProfiles = snap.docs
                .map(d => ({ uid: d.id, ...d.data() }))
                .filter(u => u.uid !== appState.currentUser.uid)
                .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
            appState.profilesLoadedOnce = true;
        }

        const normalizedQuery = normalizeText(searchTerm);
        const filtered = normalizedQuery
            ? appState.cachedProfiles.filter(u =>
                normalizeText(u.name).includes(normalizedQuery) ||
                normalizeText(u.levelName).includes(normalizedQuery)
            )
            : appState.cachedProfiles;

        if (filtered.length === 0) {
            listEl.innerHTML = normalizedQuery
                ? `<div class="aero-card p-5 text-center text-sm text-slate-600">Nenhum guardião encontrado para "<strong>${escapeHtml(searchTerm)}</strong>".</div>`
                : `<div class="aero-card p-5 text-center text-sm text-slate-600">Ainda não há outros perfis públicos sincronizados na rede. Convide amigos ou sincronize contas antigas pelo Painel Admin! 🌍</div>`;
            return;
        }

        listEl.innerHTML = filtered.map(u => {
            const isFollowing = appState.followingIds.has(u.uid);
            const lvl = getLevelInfo(u.points || 0);
            const avatarUrl = sanitizeUrl(u.photoURL, "https://placehold.co/48x48/0ea5e9/FFFFFF?text=G");

            return `
                <div class="aero-card p-3.5 flex items-center gap-3">
                    <img src="${escapeHtml(avatarUrl)}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-white shadow cursor-pointer btn-open-user-profile flex-shrink-0"
                         data-uid="${escapeHtml(u.uid)}">
                    <div class="min-w-0 flex-grow cursor-pointer btn-open-user-profile" data-uid="${escapeHtml(u.uid)}">
                        <p class="font-extrabold text-sm text-slate-800 truncate hover:text-sky-700">${escapeHtml(u.name || "Guardião")}</p>
                        <p class="text-xs text-emerald-700 font-semibold truncate">${lvl.current.emoji} ${escapeHtml(lvl.current.name)}</p>
                        <p class="text-[11px] text-slate-500">🌳 ${u.treesCared || 0} cuidadas • 📍 ${u.treesAdded || 0} adicionadas</p>
                    </div>
                    <button type="button" class="btn-follow-toggle text-xs font-bold px-3.5 py-2 rounded-full transition flex-shrink-0 ${isFollowing ? "bg-sky-100 text-sky-900 border border-sky-300" : "frutiger-aero-button aero-green small"}"
                            data-target-uid="${escapeHtml(u.uid)}">
                        ${isFollowing ? "Seguindo ✓" : "Seguir +"}
                    </button>
                </div>
            `;
        }).join("");
    } catch (err) {
        console.error("Erro ao carregar comunidade:", err);
        listEl.innerHTML = `<div class="aero-card p-4 text-center text-erro text-xs font-bold">${escapeHtml(getFirebaseErrorMessage(err))}</div>`;
    }
};

const handleToggleFollow = async (targetUid, buttonEl = null) => {
    const me = appState.currentUser;
    if (!me || !targetUid || targetUid === me.uid) return;

    if (buttonEl) buttonEl.disabled = true;
    const isCurrentlyFollowing = appState.followingIds.has(targetUid);

    const myFollowingRef = doc(db, "publicProfiles", me.uid, "following", targetUid);
    const targetFollowerRef = doc(db, "publicProfiles", targetUid, "followers", me.uid);

    try {
        if (isCurrentlyFollowing) {
            await deleteDoc(myFollowingRef);
            await deleteDoc(targetFollowerRef);
            appState.followingIds.delete(targetUid);
            showToast("Você deixou de seguir este perfil.");
        } else {
            await setDoc(myFollowingRef, { followedAt: serverTimestamp() });
            await setDoc(targetFollowerRef, {
                name: me.name,
                photoURL: me.photoURL,
                followedAt: serverTimestamp()
            });
            appState.followingIds.add(targetUid);
            showToast("Agora vocês estão conectados! 🌐");
        }

        me.followingCount = appState.followingIds.size;
        await updateDoc(doc(db, "users", me.uid), { followingCount: me.followingCount }).catch(() => {});
        updateGamificationUI();

        const searchVal = document.getElementById("community-search-input")?.value || "";
        loadCommunityDirectory(searchVal, false);

        if (appState.selectedPublicProfileUid === targetUid && !document.getElementById("public-profile-modal").classList.contains("hidden")) {
            openPublicUserProfile(targetUid);
        }
    } catch (err) {
        console.error("Erro ao seguir/deixar de seguir:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        if (buttonEl) buttonEl.disabled = false;
    }
};

const openPublicUserProfile = async (uid) => {
    if (!uid) return;
    if (uid === appState.currentUser?.uid) {
        showPage("profile");
        return;
    }

    showLoadingModal(true, "Carregando perfil...");
    try {
        const [profileSnap, followersSnap, followingSnap] = await Promise.all([
            getDoc(doc(db, "publicProfiles", uid)),
            getDocs(collection(db, "publicProfiles", uid, "followers")),
            getDocs(collection(db, "publicProfiles", uid, "following"))
        ]);

        if (!profileSnap.exists()) {
            showToast("Este guardião optou por manter o perfil privado ou ainda não ativou o perfil público.");
            return;
        }

        const u = profileSnap.data();
        appState.selectedPublicProfileUid = uid;
        const lvl = getLevelInfo(u.points || 0);
        const isFollowing = appState.followingIds.has(uid);

        document.getElementById("public-profile-avatar").src = sanitizeUrl(u.photoURL, "https://placehold.co/96x96/0ea5e9/FFFFFF?text=G");
        document.getElementById("public-profile-name").textContent = u.name || "Guardião";
        document.getElementById("public-profile-level").textContent = `${lvl.current.emoji} ${lvl.current.name} • ${u.points || 0} pts`;
        document.getElementById("public-profile-followers").textContent = `${followersSnap.size} seguidores`;
        document.getElementById("public-profile-following").textContent = `${followingSnap.size} seguindo`;
        document.getElementById("public-profile-stats").innerHTML = `
            <div class="aero-mini-stat"><strong>🌳 ${u.treesCared || 0}</strong><span>Cuidadas</span></div>
            <div class="aero-mini-stat"><strong>🍃 ${u.treesIdentified || 0}</strong><span>Identificadas</span></div>
            <div class="aero-mini-stat"><strong>📍 ${u.treesAdded || 0}</strong><span>Adicionadas</span></div>
        `;

        const unlockedIds = new Set(u.unlockedEmblems || []);
        const unlockedEmblems = EMBLEMS.filter(e => unlockedIds.has(e.id));
        document.getElementById("public-profile-emblems").innerHTML = unlockedEmblems.length > 0
            ? unlockedEmblems.map(e => `<span class="aero-badge-pill text-xs px-2.5 py-1 font-semibold">${e.emoji} ${escapeHtml(e.name)}</span>`).join("")
            : `<span class="text-xs text-slate-400 italic">Ainda desbloqueando emblemas...</span>`;

        const followBtn = document.getElementById("btn-toggle-follow-modal");
        followBtn.textContent = isFollowing ? "Seguindo ✓ (Deixar de seguir)" : "Seguir Guardião + 🌐";
        followBtn.dataset.targetUid = uid;

        document.getElementById("public-profile-modal").classList.remove("hidden");
    } catch (err) {
        console.error("Erro ao abrir perfil público:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        showLoadingModal(false);
    }
};

// --- 17. CÂMERA, IDENTIFICAÇÃO (PL@NTNET + ÁRVORE/PLANTA) E CADASTRO ---
const requestCameraAccess = async () => {
    const videoEl = document.getElementById("camera-feed");
    const placeholder = document.getElementById("camera-placeholder");

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
            videoEl.srcObject = stream;
            videoEl.classList.remove("hidden");
            placeholder.classList.add("hidden");
        } catch (error) {
            console.error("Erro ao acessar a câmera:", error);
            placeholder.querySelector("p").textContent = "Erro ao acessar a câmera. Use o botão de galeria.";
            showToast("Não foi possível acessar a câmera.");
        }
    } else {
        placeholder.querySelector("p").textContent = "Câmera não suportada. Use o botão de galeria.";
    }
};

const capturePhotoFromFeed = () => {
    const video = document.getElementById("camera-feed");
    if (!video.srcObject) {
        showToast("Câmera não está ativa.");
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        if (blob) handlePlantIdentification(blob);
    }, "image/jpeg", 0.92);
};

const handlePlantIdentification = async (file) => {
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.ok) {
        showToast(check.error);
        return;
    }

    appState.tempTreePhotoFile = file;
    document.getElementById("result-plant-image").src = URL.createObjectURL(file);
    showPage("result");
    showLoadingModal(true, "Identificando espécie via Pl@ntNet...");

    const formData = new FormData();
    formData.append("images", file, file.name || "camera-capture.jpg");

    try {
        const response = await fetch("/.netlify/functions/identify", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            let errorData;
            try { errorData = await response.json(); } catch {}
            throw new Error(`Erro do servidor: ${response.status} - ${errorData?.error || response.statusText}`);
        }

        const data = await response.json();
        const bestMatch = data.results?.[0];

        if (bestMatch && bestMatch.score > 0.2) {
            const habit = classifyPlantHabit(bestMatch.species);
            appState.currentPlantInfo = {
                commonName: bestMatch.species.commonNames?.[0] || bestMatch.species.scientificNameWithoutAuthor.split(" ")[0],
                scientificName: bestMatch.species.scientificNameWithoutAuthor,
                family: bestMatch.species.family?.scientificNameWithoutAuthor || "",
                genus: bestMatch.species.genus?.scientificNameWithoutAuthor || "",
                score: bestMatch.score,
                isTree: habit.isTree,
                habitLabel: habit.label
            };

            document.getElementById("result-common-name").textContent = appState.currentPlantInfo.commonName;
            document.getElementById("result-scientific-name").textContent = appState.currentPlantInfo.scientificName;
            const confidence = Math.round(appState.currentPlantInfo.score * 100);
            document.getElementById("result-confidence").textContent = `${confidence}%`;
            document.getElementById("result-confidence-bar").style.width = `${confidence}%`;

            const badgeEl = document.getElementById("result-plant-type-badge");
            const noteEl = document.getElementById("result-plant-type-note");
            const checkboxEl = document.getElementById("result-is-tree-checkbox");
            if (badgeEl) {
                badgeEl.textContent = habit.label;
                badgeEl.className = habit.isTree
                    ? "inline-block text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 mt-1"
                    : "inline-block text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-900 mt-1";
            }
            if (noteEl) noteEl.textContent = habit.note;
            if (checkboxEl) checkboxEl.checked = habit.isTree;
        } else {
            appState.currentPlantInfo = null;
            document.getElementById("result-common-name").textContent = "Identificação incerta";
            document.getElementById("result-scientific-name").textContent = "Tente uma foto com melhor iluminação.";
            document.getElementById("result-confidence").textContent = "0%";
            document.getElementById("result-confidence-bar").style.width = "0%";
            showToast(data.message || "Não foi possível identificar a planta.");
        }
    } catch (error) {
        console.error("Falha na chamada da Netlify Function:", error);
        appState.currentPlantInfo = null;
        document.getElementById("result-common-name").textContent = "Erro na identificação";
        document.getElementById("result-scientific-name").textContent = "Verifique sua conexão.";
        document.getElementById("result-confidence").textContent = "0%";
        document.getElementById("result-confidence-bar").style.width = "0%";
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

    const checkboxEl = document.getElementById("result-is-tree-checkbox");
    const isTreeConfirmed = checkboxEl ? checkboxEl.checked : appState.currentPlantInfo.isTree;
    appState.currentPlantInfo.isTree = isTreeConfirmed;

    if (isTreeConfirmed) {
        await awardPoints("identify_tree");
    } else {
        await awardPoints("identify_plant");
        showToast("Planta identificada (+5 pts)! Obs: apenas árvores contam para missões arbóreas. 🌿");
    }

    showPage("care");
    document.getElementById("care-title").textContent = isTreeConfirmed ? "Árvore não cadastrada!" : "Planta não cadastrada!";
    document.getElementById("care-subtitle").textContent = `Gostaria de adicionar esta ${appState.currentPlantInfo.commonName} ao mapa?`;
    document.getElementById("care-actions-container").classList.add("hidden");
    document.getElementById("add-tree-button-container").classList.remove("hidden");

    const btnNovoCadastro = document.querySelector('#add-tree-button-container [data-page="add-tree"]');
    if (btnNovoCadastro) {
        btnNovoCadastro.onclick = (e) => {
            e.preventDefault();
            showPage("add-tree");
            if (appState.tempTreePhotoFile) {
                const previewImg = document.getElementById("tree-registration-preview");
                const placeholder = document.getElementById("preview-placeholder");
                previewImg.src = URL.createObjectURL(appState.tempTreePhotoFile);
                previewImg.classList.remove("hidden");
                placeholder.classList.add("hidden");
            }
        };
    }
};

const handleRegisterNewTree = async () => {
    if (!appState.currentPlantInfo || !appState.lastUserLocation) {
        showToast("Localização exata necessária. Tente se localizar no mapa primeiro.");
        return;
    }

    let latFinal, lngFinal;
    if (appState.userMarker) {
        const posicaoAtualNoMapa = appState.userMarker.getLatLng();
        latFinal = posicaoAtualNoMapa.lat;
        lngFinal = posicaoAtualNoMapa.lng;
    } else {
        latFinal = appState.lastUserLocation.latitude;
        lngFinal = appState.lastUserLocation.longitude;
    }

    const health = document.getElementById("add-tree-health").value;
    const message = document.getElementById("add-tree-message").value.trim().slice(0, 1000);
    const photoFile = document.getElementById("add-tree-photo-input").files[0] || appState.tempTreePhotoFile;

    if (!photoFile) {
        showToast("Por favor, anexe uma foto da árvore para cadastrá-la.");
        return;
    }
    const check = validateImageFile(photoFile);
    if (!check.ok) {
        showToast(check.error);
        return;
    }

    const previewPhotoLocal = URL.createObjectURL(photoFile);
    const shouldPublishToFeed = await askFeedPublishConfirmation(
        `Publicar o cadastro de "${appState.currentPlantInfo.commonName}" no Feed da Galera?\n\n"${message || "Adicionei esta nova amiga!"}"`,
        previewPhotoLocal
    );

    showLoadingModal(true, "Cadastrando nova árvore no mapa...");
    try {
        const photoUrl = await uploadImage(photoFile, "photos");
        if (!photoUrl) throw new Error("Falha no upload da imagem");

        const newTree = {
            commonName: String(appState.currentPlantInfo.commonName || "Espécie").slice(0, 120),
            scientificName: String(appState.currentPlantInfo.scientificName || "").slice(0, 160),
            family: String(appState.currentPlantInfo.family || "").slice(0, 100),
            isTree: appState.currentPlantInfo.isTree !== false,
            status: health,
            location: new GeoPoint(latFinal, lngFinal),
            coverPhoto: photoUrl,
            createdAt: serverTimestamp(),
            createdBy: {
                uid: appState.currentUser.uid,
                name: appState.currentUser.name
            }
        };

        const docRef = await addDoc(collection(db, "trees"), newTree);

        const firstMessage = {
            action: "cadastrou esta árvore no mapa.",
            message: message || "Adicionei esta nova amiga!",
            publishToFeed: shouldPublishToFeed,
            user: {
                id: appState.currentUser.uid,
                name: appState.currentUser.name,
                photoURL: appState.currentUser.photoURL
            },
            timestamp: serverTimestamp(),
            photoUrl
        };
        const eventRef = await addDoc(collection(db, "trees", docRef.id, "careEvents"), firstMessage);

        if (shouldPublishToFeed) {
            await publishPostToCommunityFeed({
                treeId: docRef.id,
                treeName: newTree.commonName,
                action: `cadastrou ${newTree.commonName} no mapa! 📍`,
                message: firstMessage.message,
                photoUrl,
                careEventId: eventRef.id
            });
        }

        if (newTree.isTree) {
            await awardPoints("add_tree");
        } else {
            await awardPoints("mission_reward", 20);
        }

        showToast("Registro salvo! Consultando MapBiomas...");
        showPage("map");

        // INTEGRAÇÃO COM MAPBIOMAS (PYTHON) PRESERVADA
        fetch(`${PYTHON_BACKEND_URL}/trees/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                common_name: appState.currentPlantInfo.commonName,
                scientific_name: appState.currentPlantInfo.scientificName,
                lat: latFinal,
                lng: lngFinal,
                status: health,
                user_uid: appState.currentUser.uid,
                cover_photo: photoUrl
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.mapbiomas_classe && data.mapbiomas_classe !== "Área ainda não mapeada") {
                showToast(`Histórico do Solo (MapBiomas): ${data.mapbiomas_classe}! 🌍`);
            }
        })
        .catch(err => console.error("Erro na integração MapBiomas:", err));

        appState.tempTreePhotoFile = null;
        document.getElementById("add-tree-photo-input").value = null;
        document.getElementById("tree-registration-preview").src = "";
        document.getElementById("tree-registration-preview").classList.add("hidden");
        document.getElementById("preview-placeholder").classList.remove("hidden");
        document.getElementById("add-tree-message").value = "";
    } catch (error) {
        console.error("Erro ao cadastrar árvore:", error);
        showToast("Ocorreu um erro ao cadastrar a árvore.");
    } finally {
        if (previewPhotoLocal) URL.revokeObjectURL(previewPhotoLocal);
        showLoadingModal(false);
    }
};

// --- 18. PARCEIROS OFICIAIS, MAPA DE PARCEIROS E VOUCHERS ---
const initializePartnerSignupMap = () => {
    const mapEl = document.getElementById("partner-signup-map");
    if (!mapEl) return;

    if (appState.partnerSignupMap) {
        appState.partnerSignupMap.invalidateSize();
        return;
    }

    const defaultLat = -22.9068;
    const defaultLng = -43.1729;
    document.getElementById("partner-signup-lat").value = defaultLat;
    document.getElementById("partner-signup-lng").value = defaultLng;

    appState.partnerSignupMap = L.map("partner-signup-map").setView([defaultLat, defaultLng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap"
    }).addTo(appState.partnerSignupMap);

    appState.partnerSignupMarker = L.marker([defaultLat, defaultLng], { draggable: true })
        .addTo(appState.partnerSignupMap)
        .bindPopup("Arraste para o local do seu comércio 📍")
        .openPopup();

    const updateCoords = (latlng) => {
        document.getElementById("partner-signup-lat").value = latlng.lat.toFixed(6);
        document.getElementById("partner-signup-lng").value = latlng.lng.toFixed(6);
    };

    appState.partnerSignupMarker.on("dragend", (e) => updateCoords(e.target.getLatLng()));
    appState.partnerSignupMap.on("click", (e) => {
        appState.partnerSignupMarker.setLatLng(e.latlng);
        updateCoords(e.latlng);
    });
};

const loadApprovedPartnersSection = async () => {
    const dirList = document.getElementById("partners-directory-list");
    const mapEl = document.getElementById("partners-map-container");
    if (!dirList || !mapEl) return;

    dirList.innerHTML = `<p class="text-slate-500 text-center text-sm py-3">Carregando parceiros aprovados... 🏪</p>`;

    if (!appState.partnersMap) {
        appState.partnersMap = L.map("partners-map-container").setView([-22.9068, -43.1729], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(appState.partnersMap);
    } else {
        setTimeout(() => appState.partnersMap.invalidateSize(), 100);
    }

    try {
        const q = query(collection(db, "partners"), where("status", "==", "approved"));
        const snap = await getDocs(q);
        appState.cachedPartners = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        Object.values(appState.partnerMarkers).forEach(m => m.remove());
        appState.partnerMarkers = {};

        if (appState.cachedPartners.length === 0) {
            dirList.innerHTML = `
                <div class="aero-card p-4 text-center">
                    <p class="text-sm text-slate-600">Ainda estamos ativando os primeiros comércios parceiros da região! 🍀</p>
                    <p class="text-xs text-slate-500 mt-1">Tem um comércio local? Cadastre-se pela tela inicial para apoiar as árvores do bairro.</p>
                </div>
            `;
            return;
        }

        const partnerIcon = L.icon({
            iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
            shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        });

        const bounds = [];
        dirList.innerHTML = appState.cachedPartners.map(p => {
            const lat = p.location?.latitude ?? p.location?.lat;
            const lng = p.location?.longitude ?? p.location?.lng;
            const photoUrl = sanitizeUrl(p.photoURL, "https://placehold.co/64x64/0ea5e9/FFFFFF?text=🏪");

            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                const marker = L.marker([lat, lng], { icon: partnerIcon }).addTo(appState.partnersMap);
                marker.bindPopup(`<b>${escapeHtml(p.businessName)}</b><br>🌳 ${p.treesImpacted || 0} árvores apoiadas`);
                marker.on("click", () => openPartnerDetailModal(p.id));
                appState.partnerMarkers[p.id] = marker;
                bounds.push([lat, lng]);
            }

            return `
                <div class="aero-card p-3.5 flex items-center gap-3 cursor-pointer hover:scale-[1.01] transition btn-open-partner" data-partner-id="${escapeHtml(p.id)}">
                    <img src="${escapeHtml(photoUrl)}" class="w-14 h-14 rounded-xl object-cover border border-white shadow flex-shrink-0">
                    <div class="min-w-0 flex-grow">
                        <div class="flex items-center gap-1.5">
                            <p class="font-bold text-slate-800 text-sm truncate">${escapeHtml(p.businessName)}</p>
                            <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">Ativo</span>
                        </div>
                        <p class="text-xs text-slate-500 truncate">📍 ${escapeHtml(p.address)}</p>
                        <p class="text-xs font-bold text-emerald-700 mt-1">🌳 ${p.treesImpacted || 0} árvores cuidadas com apoio deste parceiro</p>
                    </div>
                    <i data-lucide="chevron-right" class="text-sky-600 flex-shrink-0"></i>
                </div>
            `;
        }).join("");

        if (bounds.length > 0) {
            appState.partnersMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar parceiros aprovados:", err);
        dirList.innerHTML = `<p class="text-erro text-xs text-center">${escapeHtml(getFirebaseErrorMessage(err))}</p>`;
    }
};

const openPartnerDetailModal = async (partnerId) => {
    const partner = appState.cachedPartners.find(p => p.id === partnerId);
    if (!partner) return;
    appState.selectedPartnerDetail = partner;

    document.getElementById("partner-detail-photo").src = sanitizeUrl(partner.photoURL, "https://placehold.co/400x200/0ea5e9/FFFFFF?text=Parceiro");
    document.getElementById("partner-detail-name").textContent = partner.businessName;
    document.getElementById("partner-detail-category").textContent = `🏪 ${partner.category || "Comércio Parceiro"}`;
    document.getElementById("partner-detail-address").textContent = `📍 ${partner.address}`;
    document.getElementById("partner-detail-description").textContent = partner.description || "";
    document.getElementById("partner-detail-trees-impacted").textContent = partner.treesImpacted || 0;

    const rewardsList = document.getElementById("partner-detail-rewards-list");
    rewardsList.innerHTML = `<p class="text-xs text-slate-500 text-center py-2">Carregando recompensas...</p>`;
    document.getElementById("partner-detail-modal").classList.remove("hidden");

    try {
        const [rewardsSnap, myRedemptionsSnap] = await Promise.all([
            getDocs(query(collection(db, "partnerRewards"), where("partnerId", "==", partnerId))),
            getDocs(query(collection(db, "redemptions"), where("userId", "==", appState.currentUser.uid)))
        ]);

        const approvedRewards = rewardsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => r.status === "approved");

        if (approvedRewards.length === 0) {
            rewardsList.innerHTML = `<p class="text-xs text-slate-500 italic text-center py-2">Este parceiro ainda está cadastrando novas recompensas.</p>`;
            return;
        }

        const redeemedByRewardId = {};
        myRedemptionsSnap.forEach(d => {
            const data = d.data();
            redeemedByRewardId[data.rewardId] = data;
        });

        const user = appState.currentUser;
        rewardsList.innerHTML = approvedRewards.map(r => {
            const userProgress = Number(user[r.missionType]) || 0;
            const reqCount = Number(r.requiredCount) || 1;
            const pct = Math.min(100, (userProgress / reqCount) * 100);
            const canRedeem = userProgress >= reqCount;
            const existingVoucher = redeemedByRewardId[r.id];

            return `
                <div class="aero-card p-3.5 border border-sky-200">
                    <p class="font-bold text-sm text-emerald-900">🎁 ${escapeHtml(r.title)}</p>
                    <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(r.description)}</p>
                    <p class="text-[11px] font-semibold text-sky-800 mt-2">
                        Missão exigida: ${escapeHtml(getMissionTypeLabel(r.missionType, reqCount))} (${Math.min(userProgress, reqCount)}/${reqCount})
                    </p>
                    <div class="aero-progress-track mt-1.5">
                        <div class="aero-progress-fill" style="width: ${pct}%"></div>
                    </div>
                    ${existingVoucher ? `
                        <div class="mt-2.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                            <p class="text-[11px] text-emerald-800 font-bold">✅ Recompensa resgatada!</p>
                            <p class="font-mono text-sm font-bold text-sky-900">Voucher: ${escapeHtml(existingVoucher.voucherCode)}</p>
                            <p class="text-[10px] text-slate-500">Apresente este código no balcão do parceiro.</p>
                        </div>
                    ` : canRedeem ? `
                        <button type="button" class="btn-redeem-reward frutiger-aero-button aero-green small w-full mt-3"
                                data-reward-id="${escapeHtml(r.id)}" data-partner-id="${escapeHtml(partnerId)}">
                            Resgatar Recompensa 🎟️
                        </button>
                    ` : `
                        <p class="text-[11px] text-slate-500 mt-2 italic">Continue cuidando das árvores para desbloquear este brinde!</p>
                    `}
                </div>
            `;
        }).join("");
    } catch (err) {
        console.error("Erro ao carregar recompensas do parceiro:", err);
        rewardsList.innerHTML = `<p class="text-xs text-erro text-center">${escapeHtml(getFirebaseErrorMessage(err))}</p>`;
    }
};

const handleRedeemReward = async (rewardId, partnerId) => {
    const user = appState.currentUser;
    if (!user) return;

    showLoadingModal(true, "Gerando seu voucher Arboriza...");
    try {
        const redemptionId = `${user.uid}_${rewardId}`;
        const existingRef = doc(db, "redemptions", redemptionId);
        const existingSnap = await getDoc(existingRef);
        if (existingSnap.exists()) {
            showToast("Você já resgatou esta recompensa! Veja seu código abaixo.");
            await openPartnerDetailModal(partnerId);
            return;
        }

        const [rewardSnap, partnerSnap] = await Promise.all([
            getDoc(doc(db, "partnerRewards", rewardId)),
            getDoc(doc(db, "partners", partnerId))
        ]);
        if (!rewardSnap.exists() || !partnerSnap.exists()) throw new Error("Recompensa indisponível.");

        const reward = rewardSnap.data();
        const partner = partnerSnap.data();

        if (reward.status !== "approved" || partner.status !== "approved") {
            showToast("Esta recompensa não está mais ativa.");
            return;
        }

        const userStat = Number(user[reward.missionType]) || 0;
        const reqCount = Number(reward.requiredCount) || 1;
        if (userStat < reqCount) {
            showToast("Você ainda não completou o requisito desta recompensa.");
            return;
        }

        const voucherCode = generateVoucherCode();
        const treesContribution = Math.min(500, Math.max(1, reward.missionType === "points" ? Math.round(reqCount / 100) : reqCount));

        await setDoc(existingRef, {
            voucherCode,
            rewardId,
            rewardTitle: reward.title,
            partnerId,
            partnerName: partner.businessName,
            userId: user.uid,
            userName: user.name,
            treesContribution,
            status: "active",
            redeemedAt: serverTimestamp()
        });

        await updateDoc(doc(db, "partners", partnerId), {
            treesImpacted: increment(treesContribution),
            vouchersRedeemed: increment(1)
        });

        partner.treesImpacted = (partner.treesImpacted || 0) + treesContribution;
        const cached = appState.cachedPartners.find(p => p.id === partnerId);
        if (cached) cached.treesImpacted = partner.treesImpacted;

        showToast(`🎟️ Voucher ${voucherCode} gerado! ${partner.businessName} ganhou +${treesContribution} árvores de impacto!`);
        await openPartnerDetailModal(partnerId);
        loadApprovedPartnersSection();
    } catch (err) {
        console.error("Erro ao resgatar recompensa:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        showLoadingModal(false);
    }
};

// --- 19. PAINEL DO PARCEIRO ---
const loadOwnPartnerDocument = async (uid) => {
    try {
        const snap = await getDoc(doc(db, "partners", uid));
        if (snap.exists()) {
            appState.currentPartnerDoc = { id: snap.id, ...snap.data() };
        }
    } catch (err) {
        console.error("Erro ao carregar documento do parceiro:", err);
    }
};

const renderPartnerDashboard = async () => {
    if (!appState.currentUser || appState.currentUser.role !== "partner") return;
    await loadOwnPartnerDocument(appState.currentUser.uid);
    const p = appState.currentPartnerDoc;
    if (!p) return;

    const statusBanner = document.getElementById("partner-dash-status-banner");
    if (p.status === "approved") {
        statusBanner.className = "aero-status-healthy p-3.5 rounded-xl text-center font-bold text-sm";
        statusBanner.innerHTML = "✅ CONTA ATIVA — Seu comércio já está visível no Mapa Oficial de Parceiros!";
    } else if (p.status === "rejected") {
        statusBanner.className = "aero-status-critical p-3.5 rounded-xl text-center font-bold text-sm";
        statusBanner.innerHTML = "❌ Cadastro recusado. Atualize suas informações ou fale com arborizarj@gmail.com.";
    } else {
        statusBanner.className = "aero-status-warning p-3.5 rounded-xl text-center font-bold text-sm";
        statusBanner.innerHTML = "🕓 AGUARDANDO APROVAÇÃO — Nossa equipe está validando seu comércio para ativá-lo no mapa.";
    }

    document.getElementById("partner-dash-photo").src = sanitizeUrl(p.photoURL, "https://placehold.co/120x120/0ea5e9/FFFFFF?text=🏪");
    document.getElementById("partner-dash-name").textContent = p.businessName;
    document.getElementById("partner-dash-category").textContent = p.category || "Comércio Local";
    document.getElementById("partner-dash-address").textContent = p.address || "";
    document.getElementById("partner-dash-trees-impacted").textContent = p.treesImpacted || 0;
    document.getElementById("partner-dash-vouchers-count").textContent = p.vouchersRedeemed || 0;

    document.getElementById("partner-edit-name").value = p.businessName || "";
    document.getElementById("partner-edit-category").value = p.category || "Comércio Local";
    document.getElementById("partner-edit-address").value = p.address || "";
    document.getElementById("partner-edit-description").value = p.description || "";

    loadPartnerOwnRewards();
    loadPartnerVouchersList();
};

const handleUpdatePartnerProfile = async (e) => {
    e.preventDefault();
    if (!appState.currentUser) return;
    const uid = appState.currentUser.uid;

    const photoFile = document.getElementById("partner-edit-photo-input").files[0];
    if (photoFile) {
        const check = validateImageFile(photoFile);
        if (!check.ok) {
            showToast(check.error);
            return;
        }
    }

    showLoadingModal(true, "Salvando dados do comércio...");
    try {
        const updates = {
            businessName: document.getElementById("partner-edit-name").value.trim().slice(0, 100),
            category: document.getElementById("partner-edit-category").value,
            address: document.getElementById("partner-edit-address").value.trim().slice(0, 200),
            description: document.getElementById("partner-edit-description").value.trim().slice(0, 500)
        };

        if (photoFile) {
            const url = await uploadImage(photoFile, `partners/${uid}`);
            if (url) {
                updates.photoURL = url;
                await updateDoc(doc(db, "users", uid), { photoURL: url, name: updates.businessName });
                appState.currentUser.photoURL = url;
            }
        } else {
            await updateDoc(doc(db, "users", uid), { name: updates.businessName });
        }

        await updateDoc(doc(db, "partners", uid), updates);
        appState.currentUser.name = updates.businessName;
        await syncPublicProfile(uid, appState.currentUser);

        showToast("Informações do comércio atualizadas! ✅");
        renderPartnerDashboard();
    } catch (err) {
        console.error("Erro ao atualizar parceiro:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        showLoadingModal(false);
    }
};

const handleAddPartnerReward = async (e) => {
    e.preventDefault();
    if (!appState.currentUser || !appState.currentPartnerDoc) return;

    const title = document.getElementById("reward-title-input").value.trim().slice(0, 100);
    const description = document.getElementById("reward-desc-input").value.trim().slice(0, 400);
    const missionType = document.getElementById("reward-mission-type").value;
    const requiredCount = Math.max(1, parseInt(document.getElementById("reward-required-count").value, 10) || 10);

    if (!title || !description) {
        showToast("Preencha o título e a descrição da recompensa.");
        return;
    }

    showLoadingModal(true, "Enviando recompensa para aprovação...");
    try {
        await addDoc(collection(db, "partnerRewards"), {
            partnerId: appState.currentUser.uid,
            partnerName: appState.currentPartnerDoc.businessName,
            title,
            description,
            missionType,
            requiredCount,
            status: "pending",
            createdAt: serverTimestamp()
        });

        e.target.reset();
        showToast("Recompensa enviada! Ela ficará ativa assim que o administrador aprovar. 🕓");
        loadPartnerOwnRewards();
    } catch (err) {
        console.error("Erro ao cadastrar recompensa:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        showLoadingModal(false);
    }
};

const loadPartnerOwnRewards = async () => {
    const container = document.getElementById("partner-rewards-manage-list");
    if (!container || !appState.currentUser) return;

    container.innerHTML = `<p class="text-xs text-slate-500 text-center">Carregando recompensas...</p>`;
    try {
        const q = query(collection(db, "partnerRewards"), where("partnerId", "==", appState.currentUser.uid));
        const snap = await getDocs(q);
        if (snap.empty) {
            container.innerHTML = `<p class="text-xs text-slate-500 italic text-center">Você ainda não cadastrou recompensas.</p>`;
            return;
        }

        container.innerHTML = snap.docs.map(d => {
            const r = d.data();
            const badge = r.status === "approved"
                ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">✅ Ativa</span>`
                : r.status === "rejected"
                    ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">❌ Recusada</span>`
                    : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">🕓 Em aprovação</span>`;

            return `
                <div class="aero-card p-3 flex items-start justify-between gap-2">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <p class="font-bold text-sm text-slate-800">${escapeHtml(r.title)}</p>
                            ${badge}
                        </div>
                        <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(r.description)}</p>
                        <p class="text-[11px] text-sky-800 font-semibold mt-1">Requisito: ${escapeHtml(getMissionTypeLabel(r.missionType, r.requiredCount))}</p>
                    </div>
                    <button type="button" class="btn-delete-reward text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1" data-reward-id="${escapeHtml(d.id)}">Excluir</button>
                </div>
            `;
        }).join("");
    } catch (err) {
        console.error("Erro ao listar recompensas do parceiro:", err);
    }
};

const loadPartnerVouchersList = async () => {
    const container = document.getElementById("partner-vouchers-manage-list");
    if (!container || !appState.currentUser) return;

    try {
        const q = query(collection(db, "redemptions"), where("partnerId", "==", appState.currentUser.uid));
        const snap = await getDocs(q);
        if (snap.empty) {
            container.innerHTML = `<p class="text-xs text-slate-500 italic text-center">Nenhum voucher resgatado ainda.</p>`;
            return;
        }

        const vouchers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.redeemedAt?.seconds || 0) - (a.redeemedAt?.seconds || 0));

        container.innerHTML = vouchers.map(v => `
            <div class="aero-card p-3 flex items-center justify-between gap-2">
                <div>
                    <p class="font-mono font-bold text-sm text-sky-900">${escapeHtml(v.voucherCode)}</p>
                    <p class="text-xs font-semibold text-slate-800">${escapeHtml(v.rewardTitle)}</p>
                    <p class="text-[11px] text-slate-500">Guardião: ${escapeHtml(v.userName)} • +${v.treesContribution || 1} árvores 🌳</p>
                </div>
                ${v.status === "used" ? `
                    <span class="text-xs font-bold text-slate-500">✅ Entregue</span>
                ` : `
                    <button type="button" class="btn-validate-voucher frutiger-aero-button aero-green small text-xs" data-voucher-id="${escapeHtml(v.id)}">Confirmar Uso</button>
                `}
            </div>
        `).join("");
    } catch (err) {
        console.error("Erro ao carregar vouchers do parceiro:", err);
    }
};

// --- 20. PAINEL ADMINISTRATIVO + MIGRAÇÃO SEGURA DE PERFIS ANTIGOS ---
const loadAdminDashboard = async () => {
    if (!isAdminUser(appState.currentUser)) return;
    showLoadingModal(true, "Carregando Painel Administrativo...");

    try {
        const [usersSnap, treesSnap, partnersSnap, rewardsSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "trees")),
            getDocs(collection(db, "partners")),
            getDocs(collection(db, "partnerRewards"))
        ]);

        const allPartners = partnersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const allRewards = rewardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const pendingPartners = allPartners.filter(p => p.status === "pending");
        const activePartners = allPartners.filter(p => p.status === "approved");
        const pendingRewards = allRewards.filter(r => r.status === "pending");

        document.getElementById("admin-stat-users").textContent = usersSnap.size;
        document.getElementById("admin-stat-trees").textContent = treesSnap.size;
        document.getElementById("admin-stat-partners").textContent = activePartners.length;
        document.getElementById("admin-stat-pending").textContent = pendingPartners.length + pendingRewards.length;

        const pendingPartnersEl = document.getElementById("admin-pending-partners-list");
        pendingPartnersEl.innerHTML = pendingPartners.length === 0
            ? `<p class="text-sm text-slate-500 italic text-center py-4">Nenhuma solicitação de parceiro pendente! ✨</p>`
            : pendingPartners.map(p => `
                <div class="aero-card p-4 space-y-2">
                    <div class="flex items-center gap-3">
                        <img src="${escapeHtml(sanitizeUrl(p.photoURL, "https://placehold.co/56x56/0ea5e9/FFFFFF?text=🏪"))}" class="w-14 h-14 rounded-xl object-cover border border-white shadow">
                        <div class="min-w-0">
                            <p class="font-bold text-slate-800">${escapeHtml(p.businessName)}</p>
                            <p class="text-xs text-sky-800 font-semibold">${escapeHtml(p.category)} • ${escapeHtml(p.email)}</p>
                            <p class="text-xs text-slate-600">📍 ${escapeHtml(p.address)}</p>
                        </div>
                    </div>
                    <p class="text-xs text-slate-700 bg-white/60 p-2 rounded-lg">${escapeHtml(p.description)}</p>
                    <div class="flex gap-2 pt-1">
                        <button type="button" class="btn-admin-partner-decision frutiger-aero-button aero-green small flex-1" data-partner-id="${escapeHtml(p.id)}" data-decision="approved">✅ Aprovar</button>
                        <button type="button" class="btn-admin-partner-decision bg-red-600 text-white text-xs font-bold py-2 px-4 rounded-full flex-1 hover:bg-red-700" data-partner-id="${escapeHtml(p.id)}" data-decision="rejected">❌ Recusar</button>
                    </div>
                </div>
            `).join("");

        const pendingRewardsEl = document.getElementById("admin-pending-rewards-list");
        pendingRewardsEl.innerHTML = pendingRewards.length === 0
            ? `<p class="text-sm text-slate-500 italic text-center py-4">Nenhuma recompensa aguardando revisão! ✨</p>`
            : pendingRewards.map(r => `
                <div class="aero-card p-4 space-y-2">
                    <p class="text-xs font-bold text-sky-800">🏪 ${escapeHtml(r.partnerName || "Parceiro")}</p>
                    <p class="font-bold text-slate-800">🎁 ${escapeHtml(r.title)}</p>
                    <p class="text-xs text-slate-600">${escapeHtml(r.description)}</p>
                    <p class="text-xs font-semibold text-emerald-800">Missão: ${escapeHtml(getMissionTypeLabel(r.missionType, r.requiredCount))}</p>
                    <div class="flex gap-2 pt-1">
                        <button type="button" class="btn-admin-reward-decision frutiger-aero-button aero-green small flex-1" data-reward-id="${escapeHtml(r.id)}" data-decision="approved">✅ Aprovar Recompensa</button>
                        <button type="button" class="btn-admin-reward-decision bg-red-600 text-white text-xs font-bold py-2 px-4 rounded-full flex-1 hover:bg-red-700" data-reward-id="${escapeHtml(r.id)}" data-decision="rejected">❌ Recusar</button>
                    </div>
                </div>
            `).join("");

        const activePartnersEl = document.getElementById("admin-active-partners-list");
        activePartnersEl.innerHTML = activePartners.length === 0
            ? `<p class="text-sm text-slate-500 italic text-center py-4">Nenhum parceiro ativo ainda.</p>`
            : activePartners.map(p => `
                <div class="aero-card p-3 flex items-center justify-between gap-2">
                    <div class="min-w-0">
                        <p class="font-bold text-sm text-emerald-900 truncate">${escapeHtml(p.businessName)}</p>
                        <p class="text-xs text-slate-600 truncate">${escapeHtml(p.address)}</p>
                        <p class="text-xs font-bold text-emerald-700">🌳 ${p.treesImpacted || 0} árvores • 🎟️ ${p.vouchersRedeemed || 0} vouchers</p>
                    </div>
                    <button type="button" class="btn-admin-partner-decision text-xs bg-amber-100 text-amber-900 font-bold px-3 py-1.5 rounded-full flex-shrink-0" data-partner-id="${escapeHtml(p.id)}" data-decision="pending">Pausar</button>
                </div>
            `).join("");
    } catch (err) {
        console.error("Erro ao carregar painel admin:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        showLoadingModal(false);
    }
};

const handleAdminSyncPublicProfiles = async () => {
    if (!isAdminUser(appState.currentUser)) return;
    showLoadingModal(true, "Sincronizando perfis antigos na rede (sem expor emails)...");
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        let count = 0;
        for (const docSnap of usersSnap.docs) {
            const uData = docSnap.data();
            if (uData.isPublicProfile === false) continue;
            await syncPublicProfile(docSnap.id, uData);
            count++;
        }
        appState.profilesLoadedOnce = false;
        showToast(`✅ ${count} perfis sincronizados com segurança na Rede!`);
    } catch (err) {
        console.error("Erro na sincronização:", err);
        showToast(getFirebaseErrorMessage(err));
    } finally {
        showLoadingModal(false);
    }
};

// --- 21. SABER MAIS (CURADORIA PRESERVADA) ---
const curatedContent = {
    "Como melhorar a terra do canteiro?": {
        intro: "A @erika.canton tem uma dica de ouro...",
        title: "Adubação Power...",
        creator: "@erika.canton",
        url: "https://www.instagram.com/p/DO-4c94Dd6J/"
    },
    "Por que não pode pintar os troncos das árvores?": {
        intro: "O mestre @ricardo__cardim explica...",
        title: "Tronco não é parede!",
        creator: "@ricardo__cardim",
        url: "https://www.instagram.com/p/DOt6dqtjkmp/"
    },
    "Como proteger uma árvore jovem?": {
        intro: "Proteger as árvores mais novas é fundamental...",
        title: "Cuidando do futuro",
        creator: "@ricardo__cardim",
        url: "https://www.instagram.com/p/DOt6dqtjkmp/"
    }
};

const handleLearnSearch = (queryText) => {
    if (!queryText) return;
    const resultsContainer = document.getElementById("learn-results-container");
    resultsContainer.innerHTML = "";
    resultsContainer.classList.remove("hidden");
    const content = curatedContent[queryText];

    if (content) {
        resultsContainer.innerHTML = `
            <p class="text-slate-700 mb-3 text-sm">${escapeHtml(content.intro)}</p>
            <a href="${escapeHtml(sanitizeUrl(content.url, "#"))}" target="_blank" rel="noopener noreferrer" class="aero-card block overflow-hidden hover:scale-[1.01] transition-all">
                <div class="w-full h-44 bg-gradient-to-br from-sky-200 to-emerald-200 flex items-center justify-center">
                    <i data-lucide="instagram" class="w-12 h-12 text-emerald-800"></i>
                </div>
                <div class="p-3.5">
                    <p class="font-bold text-md text-slate-800">${escapeHtml(content.title)}</p>
                    <p class="text-sm text-emerald-700 font-semibold">${escapeHtml(content.creator)}</p>
                </div>
            </a>`;
        if (window.lucide) lucide.createIcons();
    } else {
        resultsContainer.innerHTML = `<div class="aero-card p-4 text-center text-sm text-slate-600">O Arvoreco ainda está aprendendo sobre "${escapeHtml(queryText)}". Tente uma das sugestões acima! 🍃</div>`;
    }
};

// --- 22. HELPERS E EVENT LISTENERS ---
const setAppHeight = () => {
    document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
};

const setupEventListeners = () => {
    document.body.addEventListener("click", async (e) => {
        const navBtn = e.target.closest(".nav-btn, .nav-to-btn");
        if (navBtn && navBtn.dataset.page) {
            e.preventDefault();
            showPage(navBtn.dataset.page);
            return;
        }

        const claimBtn = e.target.closest(".btn-claim-mission");
        if (claimBtn) {
            claimMissionReward(claimBtn.dataset.claimMission);
            return;
        }

        const userTrigger = e.target.closest(".btn-open-user-profile");
        if (userTrigger && userTrigger.dataset.uid) {
            openPublicUserProfile(userTrigger.dataset.uid);
            return;
        }

        const followBtn = e.target.closest(".btn-follow-toggle");
        if (followBtn && followBtn.dataset.targetUid) {
            handleToggleFollow(followBtn.dataset.targetUid, followBtn);
            return;
        }

        const openTreeBtn = e.target.closest(".btn-open-tree-from-feed");
        if (openTreeBtn && openTreeBtn.dataset.treeId) {
            showTreeProfile(openTreeBtn.dataset.treeId);
            return;
        }

        const likeBtn = e.target.closest(".btn-like-post");
        if (likeBtn && likeBtn.dataset.postKey) {
            handleToggleLikePost(likeBtn, likeBtn.dataset.postKey);
            return;
        }

        const toggleCommentsBtn = e.target.closest(".btn-toggle-comments");
        if (toggleCommentsBtn && toggleCommentsBtn.dataset.postKey) {
            const article = toggleCommentsBtn.closest("article");
            handleToggleCommentsDrawer(toggleCommentsBtn.dataset.postKey, article);
            return;
        }

        const sendFeedCommentBtn = e.target.closest(".btn-send-feed-comment");
        if (sendFeedCommentBtn && sendFeedCommentBtn.dataset.postKey) {
            const article = sendFeedCommentBtn.closest("article");
            handleSendFeedComment(sendFeedCommentBtn.dataset.postKey, article);
            return;
        }

        const partnerCard = e.target.closest(".btn-open-partner");
        if (partnerCard && partnerCard.dataset.partnerId) {
            openPartnerDetailModal(partnerCard.dataset.partnerId);
            return;
        }

        const redeemBtn = e.target.closest(".btn-redeem-reward");
        if (redeemBtn) {
            handleRedeemReward(redeemBtn.dataset.rewardId, redeemBtn.dataset.partnerId);
            return;
        }

        const delRewardBtn = e.target.closest(".btn-delete-reward");
        if (delRewardBtn) {
            if (!confirm("Deseja excluir esta recompensa?")) return;
            await deleteDoc(doc(db, "partnerRewards", delRewardBtn.dataset.rewardId));
            showToast("Recompensa removida.");
            loadPartnerOwnRewards();
            return;
        }

        const validateVoucherBtn = e.target.closest(".btn-validate-voucher");
        if (validateVoucherBtn) {
            await updateDoc(doc(db, "redemptions", validateVoucherBtn.dataset.voucherId), {
                status: "used",
                usedAt: serverTimestamp()
            });
            showToast("Voucher validado com sucesso! ✅");
            loadPartnerVouchersList();
            return;
        }

        const adminPartnerBtn = e.target.closest(".btn-admin-partner-decision");
        if (adminPartnerBtn && isAdminUser(appState.currentUser)) {
            const { partnerId, decision } = adminPartnerBtn.dataset;
            await updateDoc(doc(db, "partners", partnerId), { status: decision });
            showToast(decision === "approved" ? "Parceiro aprovado e publicado no mapa! ✅" : "Status do parceiro atualizado.");
            loadAdminDashboard();
            return;
        }

        const adminRewardBtn = e.target.closest(".btn-admin-reward-decision");
        if (adminRewardBtn && isAdminUser(appState.currentUser)) {
            const { rewardId, decision } = adminRewardBtn.dataset;
            await updateDoc(doc(db, "partnerRewards", rewardId), { status: decision });
            showToast(decision === "approved" ? "Recompensa aprovada e liberada no jogo! 🎁" : "Recompensa recusada.");
            loadAdminDashboard();
            return;
        }
    });

    // Autenticação
    document.getElementById("login-form")?.addEventListener("submit", handleLogin);
    document.getElementById("signup-form")?.addEventListener("submit", handleSignup);
    document.getElementById("partner-signup-form")?.addEventListener("submit", handlePartnerSignup);
    document.getElementById("btn-logout")?.addEventListener("click", handleLogout);
    document.getElementById("btn-partner-logout")?.addEventListener("click", handleLogout);

    document.getElementById("btn-google-login-main")?.addEventListener("click", handleGoogleLogin);
    document.getElementById("btn-google-login-signup")?.addEventListener("click", () => {
        const consent = document.getElementById("signup-privacy-consent");
        if (consent && !consent.checked) {
            showToast("Marque a caixinha de privacidade antes de criar sua conta.");
            consent.focus();
            return;
        }
        handleGoogleLogin();
    });
    document.getElementById("btn-google-login-partner")?.addEventListener("click", handlePartnerGoogleSignup);

    // Localização no cadastro de parceiro
    document.getElementById("btn-partner-use-my-location")?.addEventListener("click", async () => {
        try {
            showLoadingModal(true, "Obtendo sua localização...");
            const pos = await getCurrentLocation();
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            document.getElementById("partner-signup-lat").value = lat.toFixed(6);
            document.getElementById("partner-signup-lng").value = lng.toFixed(6);
            if (appState.partnerSignupMap && appState.partnerSignupMarker) {
                appState.partnerSignupMap.setView([lat, lng], 16);
                appState.partnerSignupMarker.setLatLng([lat, lng]);
            }
            showToast("Localização atual definida no mapa! 📍");
        } catch {
            showToast("Não foi possível obter o GPS. Arraste o pino no mapa.");
        } finally {
            showLoadingModal(false);
        }
    });

    document.getElementById("partner-signup-photo")?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById("partner-signup-photo-preview");
        if (file && preview) {
            preview.src = URL.createObjectURL(file);
            preview.classList.remove("hidden");
        }
    });

    // Esqueci a senha
    document.getElementById("btn-show-forgot-password")?.addEventListener("click", () => {
        document.getElementById("forgot-password-modal").classList.remove("hidden");
    });
    document.getElementById("btn-close-forgot-modal")?.addEventListener("click", () => {
        document.getElementById("forgot-password-modal").classList.add("hidden");
    });
    document.getElementById("forgot-password-form")?.addEventListener("submit", handleForgotPassword);

    // Foto de perfil e Privacidade
    document.getElementById("profile-avatar-input")?.addEventListener("change", handleProfilePicUpload);
    document.getElementById("toggle-public-profile")?.addEventListener("change", handleTogglePublicProfile);

    // Atalhos de perfil para Parceiro e Admin
    document.getElementById("btn-open-partner-dashboard")?.addEventListener("click", () => showPage("partner-dashboard"));
    document.getElementById("btn-open-admin-panel")?.addEventListener("click", () => showPage("admin"));
    document.getElementById("btn-admin-sync-profiles")?.addEventListener("click", handleAdminSyncPublicProfiles);

    // Modal de confirmação antes de publicar no Feed
    document.getElementById("btn-feed-confirm-yes")?.addEventListener("click", () => {
        document.getElementById("feed-publish-confirm-modal").classList.add("hidden");
        if (appState.pendingFeedPublishResolver) {
            appState.pendingFeedPublishResolver(true);
            appState.pendingFeedPublishResolver = null;
        }
    });
    document.getElementById("btn-feed-confirm-no")?.addEventListener("click", () => {
        document.getElementById("feed-publish-confirm-modal").classList.add("hidden");
        if (appState.pendingFeedPublishResolver) {
            appState.pendingFeedPublishResolver(false);
            appState.pendingFeedPublishResolver = null;
        }
    });

    // Filtros do Feed
    document.getElementById("feed-tab-all")?.addEventListener("click", () => {
        appState.feedFilter = "all";
        document.getElementById("feed-tab-all").classList.add("aero-tab-active");
        document.getElementById("feed-tab-following").classList.remove("aero-tab-active");
        loadFeedPosts();
    });
    document.getElementById("feed-tab-following")?.addEventListener("click", () => {
        appState.feedFilter = "following";
        document.getElementById("feed-tab-following").classList.add("aero-tab-active");
        document.getElementById("feed-tab-all").classList.remove("aero-tab-active");
        loadFeedPosts();
    });

    // Busca na Comunidade (ao digitar, clicar na lupa ou apertar Enter)
    document.getElementById("btn-community-search")?.addEventListener("click", () => {
        loadCommunityDirectory(document.getElementById("community-search-input").value, true);
    });
    document.getElementById("community-search-input")?.addEventListener("input", (e) => {
        loadCommunityDirectory(e.target.value, false);
    });
    document.getElementById("community-search-input")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            loadCommunityDirectory(e.target.value, true);
        }
    });

    // Modal de Perfil Público
    document.getElementById("btn-close-public-profile")?.addEventListener("click", () => {
        document.getElementById("public-profile-modal").classList.add("hidden");
    });
    document.getElementById("btn-toggle-follow-modal")?.addEventListener("click", (e) => {
        handleToggleFollow(e.currentTarget.dataset.targetUid, e.currentTarget);
    });

    // Modal de Detalhes do Parceiro
    document.getElementById("btn-close-partner-detail")?.addEventListener("click", () => {
        document.getElementById("partner-detail-modal").classList.add("hidden");
    });

    // Formulários do Painel de Parceiro
    document.getElementById("partner-edit-form")?.addEventListener("submit", handleUpdatePartnerProfile);
    document.getElementById("partner-add-reward-form")?.addEventListener("submit", handleAddPartnerReward);

    // Abas do Painel Admin
    const switchAdminTab = (tab) => {
        ["partners", "rewards", "active-partners"].forEach(t => {
            document.getElementById(`admin-tab-${t}`)?.classList.toggle("aero-tab-active", t === tab);
            const listMap = {
                "partners": "admin-pending-partners-list",
                "rewards": "admin-pending-rewards-list",
                "active-partners": "admin-active-partners-list"
            };
            document.getElementById(listMap[t])?.classList.toggle("hidden", t !== tab);
        });
    };
    document.getElementById("admin-tab-partners")?.addEventListener("click", () => switchAdminTab("partners"));
    document.getElementById("admin-tab-rewards")?.addEventListener("click", () => switchAdminTab("rewards"));
    document.getElementById("admin-tab-active-partners")?.addEventListener("click", () => switchAdminTab("active-partners"));

    // Câmera & Identificação
    document.getElementById("plant-photo-input")?.addEventListener("change", (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handlePlantIdentification(e.target.files[0]);
        }
    });
    document.getElementById("btn-capture")?.addEventListener("click", capturePhotoFromFeed);
    document.getElementById("btn-confirm-no")?.addEventListener("click", () => {
        showToast("Tente tirar uma foto de outro ângulo.");
        document.getElementById("plant-photo-input").value = null;
        appState.tempTreePhotoFile = null;
        showPage("camera");
    });
    document.getElementById("btn-initiate-care")?.addEventListener("click", initiateCareFlow);

    // Cadastro de Nova Árvore
    document.getElementById("btn-finish-add-tree")?.addEventListener("click", handleRegisterNewTree);
    document.getElementById("btn-trigger-media")?.addEventListener("click", () => document.getElementById("add-tree-photo-input").click());
    document.getElementById("add-tree-photo-input")?.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
            appState.tempTreePhotoFile = e.target.files[0];
            const preview = document.getElementById("tree-registration-preview");
            const placeholder = document.getElementById("preview-placeholder");
            preview.src = URL.createObjectURL(e.target.files[0]);
            preview.classList.remove("hidden");
            placeholder.classList.add("hidden");
        }
    });

    // Mapa & Cuidados
    document.getElementById("btn-locate-me")?.addEventListener("click", centerMapOnUserLocation);
    document.getElementById("btn-finish-care")?.addEventListener("click", handleFinishCare);

    document.getElementById("care-photo-input")?.addEventListener("change", (e) => {
        if (e.target.files[0]) {
            document.getElementById("care-media-label").innerText = "Foto anexada ✔";
        }
    });

    document.querySelectorAll(".care-action-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            if (e.currentTarget.id === "action-prune") return;
            if (!btn.disabled) {
                document.getElementById("care-confirmation-section").classList.remove("hidden");
            }
        });
    });

    document.getElementById("btn-care-from-profile")?.addEventListener("click", () => {
        if (appState.currentTree) {
            showPage("care");
            document.getElementById("care-title").textContent = appState.currentTree.commonName;
            document.getElementById("care-subtitle").textContent = "O que esta belezura precisa hoje?";
            document.getElementById("care-actions-container").classList.remove("hidden");
            document.getElementById("add-tree-button-container").classList.add("hidden");
            document.getElementById("care-media-label").innerText = "Anexar Foto do Cuidado";
            document.getElementById("care-photo-input").value = null;
        }
    });

    document.getElementById("btn-adopt-tree")?.addEventListener("click", handleAdoptTree);

    // Comentários na Árvore
    document.getElementById("btn-post-comment")?.addEventListener("click", handlePostComment);
    document.getElementById("btn-comment-media")?.addEventListener("click", () => document.getElementById("tree-comment-photo-input").click());
    document.getElementById("tree-comment-photo-input")?.addEventListener("change", (e) => {
        const previewContainer = document.getElementById("tree-comment-photo-preview-container");
        const previewImg = document.getElementById("tree-comment-photo-preview");
        const label = document.getElementById("comment-media-label");

        if (e.target.files && e.target.files[0]) {
            previewImg.src = URL.createObjectURL(e.target.files[0]);
            previewContainer.classList.remove("hidden");
            label.innerText = "Foto Anexada ✔";
            label.classList.add("text-verde-principal", "font-bold");
        } else {
            previewContainer.classList.add("hidden");
            label.innerText = "Adicionar Foto";
            label.classList.remove("text-verde-principal", "font-bold");
        }
    });

    // Saber Mais
    document.querySelectorAll(".suggested-question-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const q = btn.textContent;
            document.getElementById("learn-search-input").value = q;
            handleLearnSearch(q);
        });
    });
    document.getElementById("learn-search-btn")?.addEventListener("click", () => {
        handleLearnSearch(document.getElementById("learn-search-input").value);
    });

    // Modal de Ajuda
    document.getElementById("btn-show-help")?.addEventListener("click", () => document.getElementById("help-modal").classList.remove("hidden"));
    document.getElementById("btn-close-help-modal")?.addEventListener("click", () => document.getElementById("help-modal").classList.add("hidden"));
};

// --- INICIALIZA A APLICAÇÃO ---
document.addEventListener("DOMContentLoaded", initializeAppCore);