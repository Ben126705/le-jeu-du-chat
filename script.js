
const boutons = document.querySelectorAll("main button");

// Bouton créer une partie
boutons[0].addEventListener("click", function() {
    alert("🐱 Tu vas bientôt pouvoir créer une partie !");
});

// Bouton rejoindre une partie
boutons[1].addEventListener("click", function() {
    const code = prompt("Entre le code de ta partie :");

    if (code) {
        alert("Recherche de la partie " + code + "...");
    }
});

console.log("Le jeu du chat est chargé !");
