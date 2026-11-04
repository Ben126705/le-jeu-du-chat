
// ============================================
// 🐱 LE JEU DU CHAT
// ============================================

// CONNEXION SUPABASE
const clientSupabase = window.supabase.createClient(
    "https://bqklelwzakgmgyucyfwu.supabase.co",
    "sb_publishable_3uZtK6GSvckzuDfP_bwOjQ_qDxaDV0o"
);

// VARIABLES DU JEU
let codeActuel = null;
let roleActuel = null;
let pseudoActuel = null;
let identifiantJoueur = null;

let suiviGPS = null;
let marqueurJoueur = null;
let marqueursSouris = {};

let actualisation = null;
let actualisationRole = null;
let actualisationDemande = null;

let latitudeActuelle = null;
let longitudeActuelle = null;
let directionActuelle = 0;
let actualisationPosition = null;
let directionActuelle = 0;
let actualisationPosition = null;

let demandeEnCours = null;
let demandeAfficheeId = null;
let traitementDemande = false;
let sourisProcheId = null;

const CLE_PARTIE = "jeuDuChat_partie";
const DISTANCE_CAPTURE = 8;

// CARTE
const carte = L.map("map").setView([48.5, 10], 4);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "&copy; OpenStreetMap"
    }
).addTo(carte);


// ============================================
// AFFICHAGE
// ============================================

function afficherStatut(message) {
    document.getElementById("statut").textContent = message;
}

function afficherCode() {
    document.getElementById("codePartie").textContent =
        "Code de ta partie : " + codeActuel;
}

function afficherCapture(titre, message) {
    document.getElementById("capturePanel").style.display = "block";
    document.getElementById("captureTitre").textContent = titre;
    document.getElementById("captureMessage").textContent = message;
    document.getElementById("captureActions").replaceChildren();
}

function cacherCapture() {
    document.getElementById("capturePanel").style.display = "none";
    document.getElementById("captureActions").replaceChildren();
}

function ajouterBouton(texte, action, parent) {
    const bouton = document.createElement("button");
    bouton.textContent = texte;
    bouton.addEventListener("click", action);
    parent.appendChild(bouton);
    return bouton;
}

function afficherMonRole() {
    const bonusPanel = document.getElementById("bonusPanel");

    if (roleActuel === "cat") {
        afficherStatut("🐱 Tu es le CHAT !");
        bonusPanel.style.display = "none";
    } else {
        afficherStatut("🐭 Tu es une SOURIS !");
        bonusPanel.style.display = "block";
        actualiserEtatBonus();
    }
}
async function actualiserEtatBonus() {
    if (!codeActuel || roleActuel !== "mouse") return;

    const { data, error } = await clientSupabase.rpc(
        "get_my_bonus_status",
        { p_code: codeActuel }
    );

    if (error) {
        console.error("Erreur état bonus :", error);
        return;
    }

    const panel = document.getElementById("bonusPanel");
    const statut = document.getElementById("bonusStatut");

    if (!data || data.length === 0) {
        panel.style.display = "none";
        return;
    }

    const bonus = data[0];

    if (!bonus.bonus_used) {
        panel.style.display = "block";
        statut.textContent = "🎁 Choisis ton bonus !";
        return;
    }

    panel.style.display = "block";

    if (bonus.bonus_type === "cat_radar" && bonus.bonus_expires_at) {
        const restant = new Date(bonus.bonus_expires_at).getTime() - Date.now();

        if (restant > 0) {
            const minutes = Math.floor(restant / 60000);
            const secondes = Math.floor((restant % 60000) / 1000);

            statut.textContent =
                `📍 Radar actif : ${minutes} min ${secondes} s restantes`;
        } else {
            statut.textContent = "📍 Ton radar est terminé.";
        }
        setInterval(() => {
    if (roleActuel === "mouse") {
        actualiserEtatBonus();
    }
}, 1000);
    } else {
        statut.textContent = "🎁 Ton bonus a été utilisé.";
    }
}

// ============================================
// CONNEXION ANONYME
// ============================================

async function connecterJoueur() {
    const { data, error } = await clientSupabase.auth.getSession();

    if (error) throw error;

    if (data.session) return;

    const resultat = await clientSupabase.auth.signInAnonymously();

    if (resultat.error) throw resultat.error;
}


// ============================================
// SAUVEGARDER LA PARTIE
// ============================================

function sauvegarderPartie() {
    localStorage.setItem(
        CLE_PARTIE,
        JSON.stringify({ code: codeActuel })
    );
}


// ============================================
// RETROUVER SA PARTIE
// ============================================

async function retrouverPartie() {
    try {
        const sauvegarde = localStorage.getItem(CLE_PARTIE);

        if (!sauvegarde) {
            afficherStatut("Bienvenue ! Crée une partie ou rejoins-en une.");
            return;
        }

        const anciennePartie = JSON.parse(sauvegarde);

        if (!anciennePartie.code) {
            localStorage.removeItem(CLE_PARTIE);
            afficherStatut("Bienvenue ! Crée une partie ou rejoins-en une.");
            return;
        }

        await connecterJoueur();

        afficherStatut("Recherche de ta partie...");

        const { data, error } = await clientSupabase.rpc(
            "get_my_game",
            { p_code: anciennePartie.code }
        );

        if (error) throw error;

        if (!data || data.length === 0) {
            localStorage.removeItem(CLE_PARTIE);
            afficherStatut("Partie terminée ou introuvable. Rejoins une nouvelle partie.");
            return;
        }

        const partie = data[0];

        codeActuel = partie.room_code;
        identifiantJoueur = partie.player_id;
        roleActuel = partie.player_role;
        pseudoActuel = partie.display_name;

        afficherCode();
        afficherMonRole();
        demarrerGPS();

    } catch (error) {
        console.error("Erreur de récupération :", error);
        afficherStatut("Impossible de retrouver la partie : " + error.message);
    }
}


// ============================================
// PERSONNAGE DU JOUEUR
// ============================================

function creerPersonnage(direction) {
    return L.divIcon({
        className: "player-marker",
        html: `
            <div class="player">
                <div class="player-circle"></div>
                <div class="player-direction"
                     style="transform: rotate(${direction}deg)">
                </div>
                <div class="player-head"></div>
                <div class="player-body"></div>
            </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
    });
}


// ============================================
// CRÉER UNE PARTIE
// ============================================

async function creerPartie() {
    try {
        await connecterJoueur();

        const pseudo = prompt("Quel est ton pseudo ?");

        if (!pseudo || !pseudo.trim()) return;

        afficherStatut("Création de la partie...");

        const { data, error } = await clientSupabase.rpc(
            "create_game",
            { p_display_name: pseudo.trim() }
        );

        if (error) throw error;

        const partie = data[0];

        codeActuel = partie.room_code;
        roleActuel = partie.player_role;
        identifiantJoueur = partie.player_id;
        pseudoActuel = pseudo.trim();

        sauvegarderPartie();
        afficherCode();
        afficherMonRole();
        demarrerGPS();

    } catch (error) {
        console.error(error);
        afficherStatut("Erreur : " + error.message);
        alert("Impossible de créer la partie : " + error.message);
    }
}


// ============================================
// REJOINDRE UNE PARTIE
// ============================================

async function rejoindrePartie() {
    try {
        await connecterJoueur();

        const pseudo = prompt("Quel est ton pseudo ?");

        if (!pseudo || !pseudo.trim()) return;

        const code = prompt("Entre le code de la partie :");

        if (!code || !code.trim()) return;

        afficherStatut("Connexion à la partie...");

        const { data, error } = await clientSupabase.rpc(
            "join_game",
            {
                p_code: code.trim(),
                p_display_name: pseudo.trim()
            }
        );

        if (error) throw error;

        const partie = data[0];

        codeActuel = partie.room_code;
        roleActuel = partie.player_role;
        identifiantJoueur = partie.player_id;
        pseudoActuel = pseudo.trim();

        sauvegarderPartie();
        afficherCode();
        afficherMonRole();
        demarrerGPS();

    } catch (error) {
        console.error(error);
        afficherStatut("Erreur : " + error.message);
        alert("Impossible de rejoindre : " + error.message);
    }
}


// ============================================
// ENVOYER SA POSITION
// ============================================

async function envoyerPosition(latitude, longitude, direction) {
    if (!codeActuel) return;

    const { error } = await clientSupabase.rpc(
        "update_my_position",
        {
            p_code: codeActuel,
            p_lat: latitude,
            p_lng: longitude,
            p_heading: direction
        }
    );

    if (error) {
        console.error("Erreur d'envoi de position :", error);
    }
}

async function utiliserBonus(typeBonus) {
    if (!codeActuel || roleActuel !== "mouse") {
        alert("Seules les souris peuvent utiliser un bonus.");
        return;
    }

    const bouton = document.getElementById("bonusPanel");
    const statut = document.getElementById("bonusStatut");

    if (!confirm("Veux-tu vraiment utiliser ce bonus ? Il sera consommé pour cette partie.")) {
        return;
    }

    statut.textContent = "Activation du bonus...";

    const { error } = await clientSupabase.rpc("use_bonus", {
        p_code: codeActuel,
        p_bonus_type: typeBonus
    });

    if (error) {
        console.error("Erreur bonus :", error);
        statut.textContent = "Impossible d'utiliser le bonus : " + error.message;
        return;
    }

    bouton.style.display = "none";

    statut.textContent = typeBonus === "freeze_cat"
        ? "🧊 Le chat est immobilisé pendant 5 minutes !"
        : "📍 Radar activé pendant 10 minutes !";
}

// ============================================
// DISTANCE ENTRE DEUX POSITIONS
// ============================================

function calculerDistance(lat1, lng1, lat2, lng2) {
    const rayon = 6371000;
    const radians = valeur => valeur * Math.PI / 180;

    const dLat = radians(lat2 - lat1);
    const dLng = radians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(radians(lat1)) *
        Math.cos(radians(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return rayon * 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}


// ============================================
// ACTUALISER LES POSITIONS DES SOURIS
// ============================================

async function actualiserSouris() {
    if (!codeActuel || roleActuel !== "cat") return;

    const { data, error } = await clientSupabase.rpc(
        "get_visible_positions",
        { p_code: codeActuel }
    );

    if (error) {
        console.error("Erreur positions des souris :", error);
        return;
    }

    const sourisVisibles = data || [];
    const idsVisibles = [];

    sourisVisibles.forEach(souris => {
        idsVisibles.push(souris.player_id);

        const position = [
            souris.latitude,
            souris.longitude
        ];

        if (!marqueursSouris[souris.player_id]) {
            marqueursSouris[souris.player_id] = L.marker(
                position,
                {
                    icon: L.divIcon({
                        className: "mouse-marker",
                        html: "🐭",
                        iconSize: [35, 35],
                        iconAnchor: [17, 17]
                    })
                }
            ).addTo(carte);
        } else {
            marqueursSouris[souris.player_id].setLatLng(position);
        }

        marqueursSouris[souris.player_id].bindTooltip(
            souris.display_name
        );
    });

    Object.keys(marqueursSouris).forEach(id => {
        if (!idsVisibles.includes(id)) {
            carte.removeLayer(marqueursSouris[id]);
            delete marqueursSouris[id];
        }
    });

    // Vérifier si une souris est à portée
    let sourisProche = null;

    if (latitudeActuelle !== null && longitudeActuelle !== null) {
        for (const souris of sourisVisibles) {
            const distance = calculerDistance(
                latitudeActuelle,
                longitudeActuelle,
                souris.latitude,
                souris.longitude
            );

            if (distance <= DISTANCE_CAPTURE) {
                sourisProche = souris;
                break;
            }
        }
    }

    // Réinitialiser une ancienne demande expirée
    if (
        demandeEnCours !== null &&
        Date.now() - demandeEnCours > 30000
    ) {
        demandeEnCours = null;
        sourisProcheId = null;
        cacherCapture();
    }

    if (!sourisProche || demandeEnCours !== null) {
        if (demandeEnCours === null) {
            sourisProcheId = null;
            cacherCapture();
        }
        return;
    }

    if (sourisProcheId === sourisProche.player_id) return;

    sourisProcheId = sourisProche.player_id;

    afficherCapture(
        "🐱 Capture possible !",
        "Tu es suffisamment proche de " + sourisProche.display_name
    );

    ajouterBouton(
        "Je t'ai touché !",
        () => demanderCapture(sourisProche.player_id),
        document.getElementById("captureActions")
    );
}


// ============================================
// DEMANDER UNE CAPTURE
// ============================================

async function demanderCapture(mousePlayerId) {
    if (demandeEnCours !== null) return;

    const { error } = await clientSupabase.rpc(
        "request_capture",
        {
            p_code: codeActuel,
            p_mouse_player_id: mousePlayerId
        }
    );

    if (error) {
        console.error("Erreur de capture :", error);
        alert("Capture impossible : " + error.message);
        return;
    }

    demandeEnCours = Date.now();

    afficherCapture(
        "⏳ Capture demandée",
        "En attente de la confirmation de la souris..."
    );
}


// ============================================
// VÉRIFIER LES DEMANDES DE CAPTURE
// ============================================
// ============================================
// RADAR : VOIR LA POSITION DU CHAT
// ============================================

async function actualiserRadarChat() {
    if (!codeActuel || roleActuel !== "mouse") return;

    const { data, error } = await clientSupabase.rpc(
        "get_cat_position_for_radar",
        { p_code: codeActuel }
    );

    if (error) {
        console.error("Erreur radar :", error);
        return;
    }

    const chat = data && data.length > 0 ? data[0] : null;

    // Radar expiré ou indisponible : retirer le marqueur
    if (!chat) {
        if (window.marqueurChatRadar) {
            carte.removeLayer(window.marqueurChatRadar);
            window.marqueurChatRadar = null;
        }
        return;
    }

    const positionChat = [chat.latitude, chat.longitude];

    if (!window.marqueurChatRadar) {
        window.marqueurChatRadar = L.marker(positionChat, {
            icon: L.divIcon({
                className: "cat-radar-marker",
                html: "🐱",
                iconSize: [35, 35],
                iconAnchor: [17, 17]
            })
        }).addTo(carte);
    } else {
        window.marqueurChatRadar.setLatLng(positionChat);
    }

    window.marqueurChatRadar.bindTooltip(
        "🐱 Position du chat : " + chat.display_name
    );
}
async function verifierDemandeCapture() {
    if (!codeActuel || roleActuel !== "mouse") return;

    const { data, error } = await clientSupabase.rpc(
        "get_my_capture_request",
        { p_code: codeActuel }
    );

    if (error) {
        console.error("Erreur demande de capture :", error);
        return;
    }

    if (!data || data.length === 0) {
        if (demandeAfficheeId !== null) {
            demandeAfficheeId = null;
            cacherCapture();
        }
        return;
    }

    const demande = data[0];

    if (demandeAfficheeId === demande.request_id) return;

    demandeAfficheeId = demande.request_id;

    afficherCapture(
        "🐱 Le chat t'a touché !",
        demande.cat_name + " affirme t'avoir attrapé. Tu confirmes ?"
    );

    ajouterBouton(
        "✅ Confirmer",
        () => repondreCapture(demande.request_id, true),
        document.getElementById("captureActions")
    );

    ajouterBouton(
        "❌ Il ne m'a pas touché",
        () => repondreCapture(demande.request_id, false),
        document.getElementById("captureActions")
    );
}


// ============================================
// RÉPONDRE À UNE DEMANDE DE CAPTURE
// ============================================

async function repondreCapture(requestId, confirmer) {
    if (traitementDemande) return;

    traitementDemande = true;

    try {
        const { error } = await clientSupabase.rpc(
            "respond_to_capture",
            {
                p_request_id: requestId,
                p_confirm: confirmer
            }
        );

        if (error) throw error;

        demandeAfficheeId = null;
        cacherCapture();

        if (confirmer) {
            afficherStatut("🐱 Tu es maintenant le CHAT !");
        } else {
            afficherStatut("🐭 Capture refusée !");
        }

        await actualiserMonRole();

    } catch (error) {
        console.error("Erreur de réponse :", error);
        alert("Impossible de répondre : " + error.message);
    } finally {
        traitementDemande = false;
    }
}


// ============================================
// GÉRER LES ACTUALISATIONS
// ============================================

function reglerActualisations() {
    if (actualisation !== null) {
        clearInterval(actualisation);
        actualisation = null;
    }

    if (actualisationDemande !== null) {
        clearInterval(actualisationDemande);
        actualisationDemande = null;
    }

    cacherCapture();
if (window.marqueurChatRadar) {
    carte.removeLayer(window.marqueurChatRadar);
    window.marqueurChatRadar = null;
}
    if (roleActuel !== "cat") {
        Object.values(marqueursSouris).forEach(marker => {
            carte.removeLayer(marker);
        });

        marqueursSouris = {};
    }

    if (roleActuel === "cat") {
        actualiserSouris();
        actualisation = setInterval(actualiserSouris, 3000);
   } else {
    verifierDemandeCapture();
    actualiserRadarChat();

    actualisationDemande = setInterval(() => {
        verifierDemandeCapture();
        actualiserRadarChat();
    }, 2000);
}
}


// ============================================
// ARRÊTER LE GPS
// ============================================

function arreterGPS() {
    if (suiviGPS !== null) {
        navigator.geolocation.clearWatch(suiviGPS);
        suiviGPS = null;
    }

    if (actualisation !== null) {
        clearInterval(actualisation);
        actualisation = null;
    }

    if (actualisationRole !== null) {
        clearInterval(actualisationRole);
        actualisationRole = null;
    }

    if (actualisationDemande !== null) {
        clearInterval(actualisationDemande);
        actualisationDemande = null;
    }

    afficherStatut("GPS arrêté. Ta partie reste sauvegardée.");
    cacherCapture();
}


// ============================================
// DÉMARRER LE GPS
// ============================================

function demarrerGPS() {
    if (!navigator.geolocation) {
        afficherStatut("Ton navigateur ne permet pas la géolocalisation.");
        return;
    }

    if (suiviGPS === null) {
        suiviGPS = navigator.geolocation.watchPosition(
            async function(position) {
                latitudeActuelle = position.coords.latitude;
                longitudeActuelle = position.coords.longitude;

                const direction = position.coords.heading ?? 0;
                directionActuelle = direction;

                const positionGPS = [
                    latitudeActuelle,
                    longitudeActuelle
                ];

                if (marqueurJoueur === null) {
                    marqueurJoueur = L.marker(
                        positionGPS,
                        { icon: creerPersonnage(direction) }
                    ).addTo(carte);
                } else {
                    marqueurJoueur.setLatLng(positionGPS);
                    marqueurJoueur.setIcon(creerPersonnage(direction));
                }

               carte.panTo(positionGPS);

                await envoyerPosition(
                    latitudeActuelle,
                    longitudeActuelle,
                    direction
                );
            },
            function(error) {
                console.error("Erreur GPS :", error);
                afficherStatut("Erreur GPS : " + error.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 2000,
                timeout: 15000
            }
        );
    }

    if (actualisationRole === null) {
        actualiserMonRole();
        actualisationRole = setInterval(actualiserMonRole, 3000);
    }

    reglerActualisations();
}


// ============================================
// ACTUALISER SON RÔLE ET DÉTECTER LA FIN
// ============================================
let chatEtaitGele = false;
async function actualiserMonRole() {
    if (!codeActuel) return;

    const { data, error } = await clientSupabase.rpc(
        "get_my_game",
        { p_code: codeActuel }
    );

    if (error) {
        console.error("Erreur de vérification du rôle :", error);
        return;
    }

    // Le joueur n'est plus actif : la partie est terminée
    if (!data || data.length === 0) {
        arreterGPS();

        localStorage.removeItem(CLE_PARTIE);

        Object.values(marqueursSouris).forEach(marker => {
            carte.removeLayer(marker);
        });

        marqueursSouris = {};

        afficherStatut("🏁 La partie est terminée !");
        alert("🏁 La partie est terminée ! Le chat a quitté la partie.");

        window.location.reload();
        return;
    }

    const partie = data[0];

        if (partie.player_role !== roleActuel) {
        roleActuel = partie.player_role;
        chatEtaitGele = false;

        afficherMonRole();
        reglerActualisations();
    }

    if (roleActuel === "cat") {
        const { data: bonus, error: erreurBonus } =
            await clientSupabase.rpc(
                "get_my_bonus_status",
                { p_code: codeActuel }
            );

        if (!erreurBonus && bonus && bonus.length > 0) {
            const gele = bonus[0].cat_frozen_until &&
                new Date(bonus[0].cat_frozen_until).getTime() > Date.now();

            if (gele) {
                chatEtaitGele = true;
                afficherStatut("🧊 TU ES IMMOBILISÉ ! Attends la fin des 5 minutes.");
            } else if (chatEtaitGele) {
                chatEtaitGele = false;
                afficherStatut("🐱 Tu peux à nouveau bouger !");
            }
        }
    }
}


// ============================================
// QUITTER LA PARTIE
// ============================================

async function quitterPartie() {
    if (!codeActuel) {
        alert("Tu n'es dans aucune partie.");
        return;
    }

    const confirmation = confirm(
        "Veux-tu vraiment quitter cette partie ?"
    );

    if (!confirmation) return;

    try {
        afficherStatut("Déconnexion de la partie...");

        const { error } = await clientSupabase.rpc(
            "leave_game",
            { p_code: codeActuel }
        );

        if (error) throw error;

        arreterGPS();

        localStorage.removeItem(CLE_PARTIE);

        alert("Tu as quitté la partie !");

        window.location.reload();

    } catch (error) {
        console.error("Erreur pour quitter :", error);
        alert("Impossible de quitter la partie : " + error.message);
    }
}
async function utiliserBonus(typeBonus) {
    if (!codeActuel || roleActuel !== "mouse") {
        alert("Seules les souris peuvent utiliser un bonus.");
        return;
    }

    if (!confirm("Veux-tu vraiment utiliser ce bonus ?")) return;

    const statut = document.getElementById("bonusStatut");
    const boutons = document.querySelectorAll("#bonusPanel button");

    statut.textContent = "Activation du bonus...";

    const { error } = await clientSupabase.rpc("use_bonus", {
        p_code: codeActuel,
        p_bonus_type: typeBonus
    });

    if (error) {
        console.error("Erreur bonus :", error);
        statut.textContent = "Erreur : " + error.message;
        return;
    }

    boutons.forEach(bouton => bouton.style.display = "none");

    statut.textContent = typeBonus === "freeze_cat"
        ? "🧊 Bonus utilisé ! Le chat est immobilisé pendant 5 minutes."
        : "📍 Bonus utilisé ! Le radar est activé pendant 10 minutes.";
}

// ============================================
// AU CHARGEMENT DE LA PAGE
// ============================================

window.addEventListener("load", retrouverPartie);

console.log("🐱 Le jeu du chat est chargé !");
