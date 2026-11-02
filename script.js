
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

let demandeEnCours = null;
let traitementDemande = false;

const CLE_PARTIE = "jeuDuChat_partie";
const DISTANCE_CAPTURE = 8;

// CARTE
const carte = L.map("map").setView([48.5, 10], 4);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "&copy; OpenStreetMap" }
).addTo(carte);

function afficherStatut(message) {
    document.getElementById("statut").textContent = message;
}

function afficherCode() {
    document.getElementById("codePartie").textContent =
        "Code de ta partie : " + codeActuel;
}

// PANNEAU DE CAPTURE
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

// CONNEXION ANONYME
async function connecterJoueur() {
    const { data, error } = await clientSupabase.auth.getSession();
    if (error) throw error;
    if (data.session) return;

    const resultat = await clientSupabase.auth.signInAnonymously();
    if (resultat.error) throw resultat.error;
}

// SAUVEGARDER LA PARTIE
function sauvegarderPartie() {
    localStorage.setItem(CLE_PARTIE, JSON.stringify({
        code: codeActuel
    }));
}

// RETROUVER SA PARTIE
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
console.log("Vérification automatique :", data);
        if (!data || data.length === 0) {
            localStorage.removeItem(CLE_PARTIE);
            afficherStatut("Partie introuvable. Rejoins une nouvelle partie.");
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

function afficherMonRole() {
    if (roleActuel === "cat") {
        afficherStatut("🐱 Tu es le CHAT !");
    } else {
        afficherStatut("🐭 Tu es une SOURIS !");
    }
}

// PERSONNAGE DU JOUEUR
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

// CRÉER UNE PARTIE
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
        console.log("Vérification de la partie :", data);
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

// REJOINDRE UNE PARTIE
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

// ENVOYER SA POSITION
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

// DISTANCE ENTRE DEUX POSITIONS
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

// GÉRER LES ACTUALISATIONS
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
        actualisationDemande = setInterval(verifierDemandeCapture, 2000);
    }
}

// DÉMARRER LE GPS
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

                carte.setView(positionGPS, 16);

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
        actualisationRole = setInterval(actualiserMonRole, 3000);
    }

    reglerActualisations();
}

// ACTUALISER SON RÔLE
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

    // La partie est terminée ou le joueur a été retiré
    if (!data || data.length === 0) {
        clearInterval(actualisationRole);
        clearInterval(actualisation);
        clearInterval(actualisationDemande);

        arreterGPS();
        localStorage.removeItem(CLE_PARTIE);

        alert("🏁 La partie est terminée ! Le chat a quitté la partie.");
        window.location.reload();
        return;
    }

    const partie = data[0];

    if (partie.player_role !== roleActuel) {
        roleActuel = partie.player_role;
        afficherMonRole();
        reglerActualisations();
    }
}
// ARRÊTER LE GPS SANS QUITTER LA PARTIE
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
// QUITTER LA PARTIE
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
// AU CHARGEMENT DE LA PAGE
window.addEventListener("load", retrouverPartie);

console.log("🐱 Le jeu du chat est chargé !");
