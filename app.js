(() => {
  const byId = (id) => document.getElementById(id);
  const siteBase = new URL(".", document.baseURI);
  let artworks = [];
  let activeFilter = "Tutte";
  let viewer = null;

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function resolveImageUrl(value) {
    if (!value) return "";
    const source = String(value);
    if (/^(?:data:|blob:|https?:\/\/)/i.test(source)) return source;
    // I record precedenti possono contenere /uploads/... oppure /staging/uploads/...
    const uploadMatch = source.match(/(?:^|\/)uploads\/([a-f0-9]{32}\.(?:jpg|png|gif|webp))(?:[?#].*)?$/i);
    if (uploadMatch) return new URL(`uploads/${uploadMatch[1]}`, siteBase).href;
    return new URL(source.replace(/^\/+/, ""), siteBase).href;
  }

  function markImageErrors(root) {
    root.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        const container = image.closest(".art-image, .thumbs button, .review, .existing-image, .main-image-preview") || image.parentElement;
        if (!container) return;
        container.classList.add("image-load-failed");
        if (!container.querySelector(".image-error-message")) {
          const message = document.createElement("span");
          message.className = "image-error-message";
          message.textContent = "Immagine non disponibile";
          container.append(message);
        }
      }, { once: true });
    });
  }

  function renderGallery() {
    const query = byId("search").value.trim().toLocaleLowerCase("it");
    const visibleArtworks = artworks.filter((artwork) => {
      const matchesFilter = activeFilter === "Tutte" || artwork.support === activeFilter;
      const searchableText = `${artwork.title || ""} ${artwork.description || ""} ${artwork.technique || ""}`.toLocaleLowerCase("it");
      return matchesFilter && searchableText.includes(query);
    });

    if (!visibleArtworks.length) {
      byId("gallery").innerHTML = '<div class="empty">Nessuna opera trovata. Prova a modificare la ricerca.</div>';
      return;
    }

    byId("gallery").innerHTML = visibleArtworks.map((artwork) => `
      <article class="art-card" data-id="${escapeHtml(artwork.id)}">
        <div class="art-image">
          <img src="${escapeHtml(resolveImageUrl(artwork.image))}" alt="${escapeHtml(artwork.title)}">
          <span class="art-tag">${escapeHtml(artwork.support || "Opera")}</span>
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
    markImageErrors(byId("gallery"));
    document.querySelectorAll(".art-card").forEach((card) => {
      card.addEventListener("click", () => showArtworkDetails(card.dataset.id));
    });
  }

  function updateZoomReadout() {
    if (!viewer || !viewer.viewport) return;
    const factor = viewer.viewport.getZoom(true) / viewer.viewport.getHomeZoom();
    byId("zoomReadout").textContent = `Zoom ${Math.round(factor * 100)}%`;
  }

  function openImageViewer(imageSource) {
    const errorMessage = byId("osdError");
    errorMessage.hidden = true;
    if (!window.OpenSeadragon) {
      errorMessage.textContent = "Zoom non disponibile: OpenSeadragon non è stato caricato.";
      errorMessage.hidden = false;
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
        gestureSettingsMouse: { scrollToZoom: true, clickToZoom: true, dblClickToZoom: true }
      });
      viewer.addHandler("open", () => { errorMessage.hidden = true; updateZoomReadout(); });
      viewer.addHandler("open-failed", () => {
        errorMessage.textContent = "Impossibile caricare questa immagine. Verifica che il file sia presente sul server.";
        errorMessage.hidden = false;
      });
      viewer.addHandler("zoom", updateZoomReadout);
      viewer.addHandler("animation", updateZoomReadout);
    }
    viewer.open({ type: "image", url: resolveImageUrl(imageSource) });
  }

  function setZoomLevel(level) {
    if (!viewer || !viewer.isOpen()) return;
    if (level === "fit") {
      viewer.viewport.goHome(true);
      updateZoomReadout();
      return;
    }
    viewer.viewport.zoomTo(viewer.viewport.getHomeZoom() * Number(level));
    viewer.viewport.applyConstraints();
    updateZoomReadout();
  }

  function showArtworkDetails(id) {
    const artwork = artworks.find((item) => item.id === id);
    if (!artwork) return;
    const allImages = [artwork.image, ...(Array.isArray(artwork.extras) ? artwork.extras : [])].filter(Boolean);
    const reviews = Array.isArray(artwork.reviews) ? artwork.reviews : [];

    byId("detailContent").innerHTML = `
      <div class="eyebrow">${escapeHtml(artwork.support || "Opera")} · ${escapeHtml(artwork.status || "")}</div>
      <h2>${escapeHtml(artwork.title)}</h2>
      <p>${escapeHtml(artwork.description || "Descrizione non ancora inserita.")}</p>
      <div class="specs">
        <div class="spec"><small>Supporto</small><strong>${escapeHtml(artwork.support || "—")}</strong></div>
        <div class="spec"><small>Tecnica</small><strong>${escapeHtml(artwork.technique || "—")}</strong></div>
        <div class="spec"><small>Dimensioni</small><strong>${escapeHtml(artwork.dimensions || "—")}</strong></div>
        <div class="spec"><small>Anno</small><strong>${escapeHtml(artwork.year || "—")}</strong></div>
      </div>
      <div class="eyebrow">Galleria fotografica</div>
      <div class="thumbs">
        ${allImages.map((source, index) => `<button type="button" data-image-index="${index}" aria-label="Mostra fotografia ${index + 1}"><img src="${escapeHtml(resolveImageUrl(source))}" alt="Fotografia ${index + 1}"></button>`).join("")}
      </div>
      <div class="reviews">
        <h3>Testimonianze ${reviews.length ? `(${reviews.length})` : ""}</h3>
        ${reviews.length ? reviews.map((review) => `
          <div class="review">
            ${review.photo ? `<img src="${escapeHtml(resolveImageUrl(review.photo))}" alt="Foto condivisa dal cliente">` : ""}
            <div><strong style="font-size:12px">${escapeHtml(review.name || "Cliente")}</strong><p>${escapeHtml(review.text || "")}</p><small>Testimonianza</small></div>
          </div>`).join("") : "<p>Non sono ancora presenti recensioni per quest'opera.</p>"}
      </div>`;

    markImageErrors(byId("detailContent"));
    byId("detailOverlay").classList.add("show");
    if (artwork.image) openImageViewer(artwork.image);
    else {
      byId("osdError").textContent = "Questa opera non ha un’immagine principale.";
      byId("osdError").hidden = false;
    }
    byId("detailContent").querySelectorAll("[data-image-index]").forEach((button) => {
      button.addEventListener("click", () => openImageViewer(allImages[Number(button.dataset.imageIndex)]));
    });
  }

  function closeOverlay(id) {
    byId(id).classList.remove("show");
    if (id === "detailOverlay" && viewer) viewer.close();
  }

  document.querySelectorAll("[data-zoom]").forEach((button) => button.addEventListener("click", () => setZoomLevel(button.dataset.zoom)));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeOverlay(button.dataset.close)));
  document.querySelectorAll(".overlay").forEach((overlay) => overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay(overlay.id);
  }));
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((filterButton) => filterButton.classList.toggle("active", filterButton === button));
    renderGallery();
  }));
  byId("search").addEventListener("input", renderGallery);

  async function loadArtworks() {
    try {
      const response = await fetch(new URL("api.php?action=artworks", siteBase), { credentials: "same-origin", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Errore server (${response.status}).`);
      if (!Array.isArray(result.artworks)) throw new Error("Risposta del catalogo non valida.");
      artworks = result.artworks;
      artworks.sort((first, second) => (first.title || "").localeCompare(second.title || "", "it"));
      renderGallery();
    } catch (error) {
      byId("gallery").innerHTML = `<div class="empty">Impossibile caricare la galleria: ${escapeHtml(error.message)}. Riprova più tardi.</div>`;
      console.error("Errore nel caricamento del catalogo:", error);
    }
  }

  loadArtworks();
})();
