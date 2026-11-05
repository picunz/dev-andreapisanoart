// ------------------------------------------------------------
    // Configurazione e stato dell'applicazione
    // ------------------------------------------------------------
    const DATABASE_NAME = "atelierGalleryDB_v2";
    const STORE_NAME = "artworks";
    const DEMO_IMAGE = "assets/demo-artwork.jpg";

    let database;
    let artworks = [];
    let activeFilter = "Tutte";
    let viewer = null;
    let currentArtwork = null;

    const byId = (id) => document.getElementById(id);

    // ------------------------------------------------------------
    // Immagini dimostrative secondarie in SVG
    // ------------------------------------------------------------
    function createDemoIllustration(background, curve, accent) {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1050">
          <defs>
            <linearGradient id="paper" x2="0" y2="1">
              <stop offset="0" stop-color="${background}" />
              <stop offset="1" stop-color="${accent}" />
            </linearGradient>
            <filter id="grain">
              <feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" />
              <feColorMatrix values=".5 0 0 0 .2 .5 0 0 0 .2 .5 0 0 0 .2 0 0 0 .12 0" />
            </filter>
          </defs>
          <rect width="900" height="1050" fill="url(#paper)" />
          <path d="M0 780 Q220 650 430 790 T900 740 V1050 H0Z" fill="${accent}" opacity=".6" />
          <path d="${curve}" fill="none" stroke="#eee4d5" stroke-width="28" stroke-linecap="round" opacity=".9" />
          <circle cx="650" cy="260" r="115" fill="#d6b78c" opacity=".8" />
          <rect width="900" height="1050" filter="url(#grain)" opacity=".28" />
        </svg>`;
      return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
    }

    const demoArtworks = [
      {
        id: "demo-high-resolution",
        title: "Paesaggio impressionista — studio zoom",
        support: "Tela",
        technique: "Olio su tela · immagine dimostrativa",
        dimensions: "4000 × 3000 px · file demo",
        description: "Immagine dimostrativa originale ad alta risoluzione, creata per provare i livelli di ingrandimento. Prova i pulsanti 2×, 4× e 6× e osserva la trama pittorica, i segni del pennello e le variazioni di colore. Non è un'opera in vendita.",
        status: "Demo zoom",
        year: "Demo",
        image: DEMO_IMAGE,
        extras: [],
        reviews: []
      },
      {
        id: "demo2",
        title: "Orizzonte sospeso",
        support: "Tela",
        technique: "Acrilico",
        dimensions: "50 × 70 cm",
        description: "Campiture sovrapposte e segni essenziali costruiscono un paesaggio immaginario, in equilibrio tra quiete e movimento.",
        status: "Disponibile",
        year: "2025",
        image: createDemoIllustration("#c1a88b", "M90 480 Q280 100 450 500 T820 360", "#8b6853"),
        extras: [],
        reviews: []
      },
      {
        id: "demo3",
        title: "Memoria minerale",
        support: "Ardesia",
        technique: "Tecnica materica",
        dimensions: "25 × 35 cm",
        description: "La superficie scura dell'ardesia diventa parte integrante dell'opera: una base viva che dialoga con i dettagli dipinti.",
        status: "In esposizione",
        year: "2025",
        image: createDemoIllustration("#464846", "M100 250 Q300 700 500 260 T800 650", "#9b8c76"),
        extras: [],
        reviews: []
      },
      {
        id: "demo4",
        title: "Giardino interiore",
        support: "Tela",
        technique: "Olio e acrilico",
        dimensions: "40 × 50 cm",
        description: "Forme organiche e colori caldi evocano un giardino immaginato, intimo e in continua trasformazione.",
        status: "Venduta",
        year: "2024",
        image: createDemoIllustration("#9a8069", "M100 700 Q250 100 460 650 T800 280", "#68745c"),
        extras: [],
        reviews: []
      },
      {
        id: "demo5",
        title: "Segni del tempo",
        support: "Ardesia",
        technique: "Tecnica mista",
        dimensions: "20 × 30 cm",
        description: "Un lavoro che valorizza venature, spessori e imperfezioni naturali della pietra.",
        status: "Disponibile",
        year: "2026",
        image: createDemoIllustration("#55575a", "M100 400 Q300 100 430 600 T800 250", "#8d8274"),
        extras: [],
        reviews: []
      }
    ];

    // ------------------------------------------------------------
    // IndexedDB: salvataggio locale delle opere nel browser
    // ------------------------------------------------------------
    function openDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);

        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    function getAllArtworks() {
      return new Promise((resolve, reject) => {
        const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    function saveArtwork(artwork) {
      return new Promise((resolve, reject) => {
        const request = database.transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME)
          .put(artwork);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    function deleteArtwork(id) {
      return new Promise((resolve, reject) => {
        const request = database.transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME)
          .delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        if (!file) {
          resolve("");
          return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }

    function escapeHtml(value = "") {
      return String(value).replace(/[&<>"']/g, (character) => {
        const replacements = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        };
        return replacements[character];
      });
    }

    // ------------------------------------------------------------
    // Rendering del catalogo e filtri
    // ------------------------------------------------------------
    function renderGallery() {
      const query = byId("search").value.toLowerCase();
      const visibleArtworks = artworks.filter((artwork) => {
        const matchesFilter = activeFilter === "Tutte" || artwork.support === activeFilter;
        const searchableText = `${artwork.title} ${artwork.description} ${artwork.technique}`.toLowerCase();
        return matchesFilter && searchableText.includes(query);
      });

      if (visibleArtworks.length === 0) {
        byId("gallery").innerHTML = '<div class="empty">Nessuna opera trovata. Prova a modificare la ricerca o aggiungi una nuova opera.</div>';
        return;
      }

      byId("gallery").innerHTML = visibleArtworks.map((artwork) => `
        <article class="art-card" data-id="${escapeHtml(artwork.id)}">
          <div class="art-image">
            <img src="${artwork.image}" alt="${escapeHtml(artwork.title)}">
            <span class="art-tag">${escapeHtml(artwork.support)}</span>
          </div>
          <div class="art-info">
            <h3>${escapeHtml(artwork.title)}</h3>
            <div class="art-meta">
              <span>${escapeHtml(artwork.technique || "Opera originale")}</span>
              <span>${escapeHtml(artwork.dimensions || "")}</span>
            </div>
          </div>
        </article>
      `).join("");

      document.querySelectorAll(".art-card").forEach((card) => {
        card.addEventListener("click", () => showArtworkDetails(card.dataset.id));
      });
    }

    // ------------------------------------------------------------
    // OpenSeadragon: apertura immagine e controlli di zoom
    // ------------------------------------------------------------
    function updateZoomReadout() {
      if (!viewer || !viewer.viewport) return;
      const homeZoom = viewer.viewport.getHomeZoom();
      const currentZoom = viewer.viewport.getZoom(true);
      const factor = currentZoom / homeZoom;
      byId("zoomReadout").textContent = `Zoom ${Math.round(factor * 100)}%`;
    }

    function openImageViewer(imageSource) {
      if (!window.OpenSeadragon) {
        byId("osd").innerHTML = '<p style="padding:24px;color:white">OpenSeadragon non è stato caricato. Controlla la connessione Internet.</p>';
        return;
      }

      if (!viewer) {
        viewer = OpenSeadragon({
          id: "osd",
          prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
          showNavigator: true,
          showZoomControl: true,
          showHomeControl: true,
          showFullPageControl: true,
          animationTime: 0.8,
          blendTime: 0.1,
          visibilityRatio: 1,
          constrainDuringPan: true,
          maxZoomPixelRatio: 6,
          gestureSettingsMouse: {
            scrollToZoom: true,
            clickToZoom: true,
            dblClickToZoom: true
          }
        });

        viewer.addHandler("open", updateZoomReadout);
        viewer.addHandler("zoom", updateZoomReadout);
        viewer.addHandler("animation", updateZoomReadout);
      }

      viewer.open({ type: "image", url: imageSource });
    }

    function setZoomLevel(level) {
      if (!viewer || !viewer.isOpen()) return;

      if (level === "fit") {
        viewer.viewport.goHome(true);
        updateZoomReadout();
        return;
      }

      const homeZoom = viewer.viewport.getHomeZoom();
      const targetZoom = homeZoom * Number(level);
      viewer.viewport.zoomTo(targetZoom);
      viewer.viewport.applyConstraints();
      updateZoomReadout();
    }

    document.querySelectorAll("[data-zoom]").forEach((button) => {
      button.addEventListener("click", () => setZoomLevel(button.dataset.zoom));
    });

    // ------------------------------------------------------------
    // Scheda dell'opera, immagini aggiuntive e recensioni
    // ------------------------------------------------------------
    function showArtworkDetails(id) {
      currentArtwork = artworks.find((artwork) => artwork.id === id);
      if (!currentArtwork) return;

      const artwork = currentArtwork;
      const allImages = [artwork.image, ...(artwork.extras || [])];
      const reviews = artwork.reviews || [];

      byId("detailContent").innerHTML = `
        <div class="eyebrow">${escapeHtml(artwork.support)} · ${escapeHtml(artwork.status || "")}</div>
        <h2>${escapeHtml(artwork.title)}</h2>
        <p>${escapeHtml(artwork.description || "Descrizione non ancora inserita.")}</p>

        <div class="specs">
          <div class="spec"><small>Supporto</small><strong>${escapeHtml(artwork.support)}</strong></div>
          <div class="spec"><small>Tecnica</small><strong>${escapeHtml(artwork.technique || "—")}</strong></div>
          <div class="spec"><small>Dimensioni</small><strong>${escapeHtml(artwork.dimensions || "—")}</strong></div>
          <div class="spec"><small>Anno</small><strong>${escapeHtml(artwork.year || "—")}</strong></div>
        </div>

        <div class="eyebrow">Galleria fotografica</div>
        <div class="thumbs">
          ${allImages.map((source, index) => `
            <button type="button" data-image-index="${index}" aria-label="Mostra fotografia ${index + 1}">
              <img src="${source}" alt="Fotografia ${index + 1}">
            </button>
          `).join("")}
        </div>

        <div class="reviews">
          <h3>Testimonianze ${reviews.length ? `(${reviews.length})` : ""}</h3>
          ${reviews.length ? reviews.map((review) => `
            <div class="review">
              ${review.photo ? `<img src="${review.photo}" alt="Foto condivisa dal cliente">` : ""}
              <div>
                <strong style="font-size:12px">${escapeHtml(review.name || "Cliente")}</strong>
                <p>${escapeHtml(review.text || "")}</p>
                <small>Testimonianza</small>
              </div>
            </div>
          `).join("") : "<p>Non sono ancora presenti recensioni per quest'opera.</p>"}
        </div>

        <button class="btn" id="editCurrent" style="margin-top:16px">Modifica scheda</button>
      `;

      byId("detailOverlay").classList.add("show");
      openImageViewer(artwork.image);

      byId("detailContent").querySelectorAll("[data-image-index]").forEach((button) => {
        button.addEventListener("click", () => {
          openImageViewer(allImages[Number(button.dataset.imageIndex)]);
        });
      });

      byId("editCurrent").addEventListener("click", () => {
        closeOverlay("detailOverlay");
        openArtworkForm(artwork.id);
      });
    }

    // ------------------------------------------------------------
    // Apertura e chiusura finestre modali
    // ------------------------------------------------------------
    function closeOverlay(id) {
      byId(id).classList.remove("show");
      if (id === "detailOverlay" && viewer) viewer.close();
    }

    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeOverlay(button.dataset.close));
    });

    document.querySelectorAll(".overlay").forEach((overlay) => {
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeOverlay(overlay.id);
      });
    });

    // ------------------------------------------------------------
    // Form amministrativo: inserimento e modifica opere
    // ------------------------------------------------------------
    function openArtworkForm(id = "") {
      const artwork = artworks.find((item) => item.id === id);
      byId("artForm").reset();
      byId("artId").value = artwork?.id || "";
      byId("formTitle").textContent = artwork ? "Modifica opera" : "Aggiungi un'opera";
      byId("deleteBtn").hidden = !artwork;

      byId("title").value = artwork?.title || "";
      byId("support").value = artwork?.support || "Tela";
      byId("technique").value = artwork?.technique || "";
      byId("dimensions").value = artwork?.dimensions || "";
      byId("description").value = artwork?.description || "";
      byId("status").value = artwork?.status || "Disponibile";
      byId("year").value = artwork?.year || new Date().getFullYear();
      byId("reviewer").value = artwork?.reviews?.[0]?.name || "";
      byId("reviewText").value = artwork?.reviews?.[0]?.text || "";

      byId("formOverlay").classList.add("show");
    }

    byId("addBtn").addEventListener("click", () => openArtworkForm());

    byId("artForm").addEventListener("submit", async (event) => {
      event.preventDefault();

      const id = byId("artId").value || `art-${Date.now()}`;
      const previousArtwork = artworks.find((item) => item.id === id);

      const mainImage = await readFileAsDataUrl(byId("mainImage").files[0]);
      const additionalImages = await Promise.all(
        [...byId("extraImages").files].map(readFileAsDataUrl)
      );
      const reviewPhoto = await readFileAsDataUrl(byId("reviewPhoto").files[0]);

      const reviewerName = byId("reviewer").value.trim();
      const reviewText = byId("reviewText").value.trim();
      let reviews = previousArtwork?.reviews || [];

      if (reviewerName || reviewText || reviewPhoto) {
        const firstReview = {
          name: reviewerName,
          text: reviewText,
          photo: reviewPhoto || reviews[0]?.photo || ""
        };
        reviews = [firstReview, ...reviews.slice(1)];
      }

      const artwork = {
        id,
        title: byId("title").value.trim(),
        support: byId("support").value,
        technique: byId("technique").value.trim(),
        dimensions: byId("dimensions").value.trim(),
        description: byId("description").value.trim(),
        status: byId("status").value,
        year: byId("year").value.trim(),
        image: mainImage || previousArtwork?.image || createDemoIllustration("#aaa", "M100 500 Q300 100 500 500 T800 300", "#77695b"),
        extras: [...(previousArtwork?.extras || []), ...additionalImages],
        reviews
      };

      await saveArtwork(artwork);
      await refreshGallery();
      closeOverlay("formOverlay");
    });

    byId("deleteBtn").addEventListener("click", async () => {
      const id = byId("artId").value;
      if (!id || !confirm("Vuoi eliminare questa opera?")) return;

      await deleteArtwork(id);
      await refreshGallery();
      closeOverlay("formOverlay");
    });

    // ------------------------------------------------------------
    // Filtri, ricerca, ripristino dati dimostrativi
    // ------------------------------------------------------------
    document.querySelectorAll(".filter").forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll(".filter").forEach((filterButton) => {
          filterButton.classList.toggle("active", filterButton === button);
        });
        renderGallery();
      });
    });

    byId("search").addEventListener("input", renderGallery);

    byId("resetDemo").addEventListener("click", async () => {
      const confirmed = confirm("Ripristinare le opere dimostrative? Le opere inserite verranno eliminate.");
      if (!confirmed) return;

      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = async () => {
        for (const artwork of demoArtworks) {
          await saveArtwork(artwork);
        }
        await refreshGallery();
      };
    });

    async function refreshGallery() {
      artworks = await getAllArtworks();
      artworks.sort((first, second) => first.title.localeCompare(second.title, "it"));
      renderGallery();
    }

    // ------------------------------------------------------------
    // Avvio applicazione
    // ------------------------------------------------------------
    async function startApplication() {
      try {
        database = await openDatabase();
        artworks = await getAllArtworks();

        if (artworks.length === 0) {
          for (const artwork of demoArtworks) {
            await saveArtwork(artwork);
          }
        }

        await refreshGallery();
      } catch (error) {
        byId("gallery").innerHTML = '<div class="empty">Il browser non consente il salvataggio locale. Prova ad aprire la pagina con un browser aggiornato.</div>';
        console.error("Errore durante l'avvio della galleria:", error);
      }
    }

    startApplication();
