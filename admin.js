(() => {
  const byId = (id) => document.getElementById(id);
  const state = { artworks: [], csrfToken: null };
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  async function api(url, options = {}) {
    const response = await fetch(`api.php${url}`, { credentials: "same-origin", ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Errore server (${response.status}).`);
    return payload;
  }

  function showNotice(target, message, success = false) {
    const node = byId(target);
    node.textContent = message;
    node.classList.toggle("success", success);
  }

  function setAuthenticated(authenticated) {
    byId("loginView").hidden = authenticated;
    byId("adminView").hidden = !authenticated;
    byId("logoutBtn").hidden = !authenticated;
  }

  async function loadArtworks() {
    const result = await api("?action=artworks");
    state.artworks = result.artworks || [];
    state.artworks.sort((a, b) => (a.title || "").localeCompare(b.title || "", "it"));
    renderList();
  }

  function renderList() {
    const list = byId("artworkList");
    if (!state.artworks.length) {
      list.innerHTML = '<div class="empty">Non ci sono ancora opere. Usa “Nuova opera” per aggiungere la prima.</div>';
      return;
    }
    list.innerHTML = state.artworks.map((artwork) => `
      <article class="admin-row">
        <img src="${escapeHtml(artwork.image || "assets/demo-artwork.jpg")}" alt="">
        <div><h3>${escapeHtml(artwork.title)}${artwork.isCover ? '<span class="cover-badge">Copertina</span>' : ""}</h3><p>${escapeHtml(artwork.support || "")} · ${escapeHtml(artwork.year || "")}</p></div>
        <button class="btn" type="button" data-edit="${escapeHtml(artwork.id)}">Modifica</button>
      </article>`).join("");
    list.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.edit)));
  }

  function openEditor(id = "") {
    const artwork = state.artworks.find((item) => item.id === id);
    byId("artworkForm").reset();
    byId("artId").value = artwork?.id || "";
    byId("editorTitle").textContent = artwork ? "Modifica opera" : "Nuova opera";
    byId("deleteBtn").hidden = !artwork;
    byId("title").value = artwork?.title || "";
    byId("support").value = artwork?.support || "Tela";
    byId("technique").value = artwork?.technique || "";
    byId("dimensions").value = artwork?.dimensions || "";
    byId("status").value = artwork?.status || "Disponibile";
    byId("year").value = artwork?.year || new Date().getFullYear();
    byId("description").value = artwork?.description || "";
    byId("isCover").checked = Boolean(artwork?.isCover);
    byId("reviewer").value = artwork?.reviews?.[0]?.name || "";
    byId("reviewText").value = artwork?.reviews?.[0]?.text || "";
    byId("currentMainImage").textContent = artwork?.image ? "È già presente un’immagine principale; se non scegli un file verrà mantenuta." : "";
    const extras = artwork?.extras || [];
    byId("extraImagesWrap").hidden = extras.length === 0;
    byId("existingImages").innerHTML = extras.map((src, index) => `<div class="existing-image"><img src="${escapeHtml(src)}" alt="Fotografia aggiuntiva ${index + 1}"><label><input type="checkbox" data-keep-extra="${index}" checked> Mantieni</label></div>`).join("");
    byId("editor").hidden = false;
    byId("editor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitArtwork(event) {
    event.preventDefault();
    const id = byId("artId").value;
    const previous = state.artworks.find((item) => item.id === id);
    const keptExtras = (previous?.extras || []).filter((_, index) => byId("existingImages").querySelector(`[data-keep-extra="${index}"]`)?.checked);
    const reviews = [...(previous?.reviews || [])];
    if (byId("reviewer").value.trim() || byId("reviewText").value.trim() || reviews[0]) {
      reviews[0] = { ...(reviews[0] || {}), name: byId("reviewer").value.trim(), text: byId("reviewText").value.trim() };
    }
    const artwork = {
      ...(previous || {}), id: id || `art-${Date.now()}`,
      title: byId("title").value.trim(), support: byId("support").value,
      technique: byId("technique").value.trim(), dimensions: byId("dimensions").value.trim(),
      status: byId("status").value, year: byId("year").value.trim(),
      description: byId("description").value.trim(), extras: keptExtras, reviews,
      isCover: byId("isCover").checked
    };
    const formData = new FormData();
    formData.append("action", "save");
    formData.append("artwork", JSON.stringify(artwork));
    for (const file of byId("extraImages").files) formData.append("extraImages[]", file);
    if (byId("mainImage").files[0]) formData.append("mainImage", byId("mainImage").files[0]);
    if (byId("reviewPhoto").files[0]) formData.append("reviewPhoto", byId("reviewPhoto").files[0]);
    byId("saveBtn").disabled = true;
    showNotice("pageNotice", "Salvataggio in corso…");
    try {
      await api("", { method: "POST", headers: { "X-CSRF-Token": state.csrfToken }, body: formData });
      byId("editor").hidden = true;
      showNotice("pageNotice", "Opera salvata.", true);
      await loadArtworks();
    } catch (error) {
      showNotice("pageNotice", error.message);
    } finally {
      byId("saveBtn").disabled = false;
    }
  }

  async function deleteArtwork() {
    const id = byId("artId").value;
    const artwork = state.artworks.find((item) => item.id === id);
    if (!id || !confirm(`Eliminare “${artwork?.title || "questa opera"}” e le sue immagini?`)) return;
    try {
      await api("", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrfToken }, body: JSON.stringify({ action: "delete", id }) });
      byId("editor").hidden = true;
      showNotice("pageNotice", "Opera eliminata.", true);
      await loadArtworks();
    } catch (error) {
      showNotice("pageNotice", error.message);
    }
  }

  byId("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showNotice("loginNotice", "Verifica accesso…");
    try {
      const result = await api("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", password: byId("password").value }) });
      state.csrfToken = result.csrfToken;
      setAuthenticated(true);
      showNotice("pageNotice", "Accesso effettuato.", true);
      await loadArtworks();
    } catch (error) {
      showNotice("loginNotice", error.message);
    }
  });

  byId("logoutBtn").addEventListener("click", async () => {
    try {
      await api("", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrfToken }, body: JSON.stringify({ action: "logout" }) });
    } finally {
      state.csrfToken = null;
      setAuthenticated(false);
    }
  });
  byId("newArtworkBtn").addEventListener("click", () => openEditor());
  byId("cancelBtn").addEventListener("click", () => { byId("editor").hidden = true; });
  byId("artworkForm").addEventListener("submit", submitArtwork);
  byId("deleteBtn").addEventListener("click", deleteArtwork);

  api("?action=auth").then(async (result) => {
    setAuthenticated(Boolean(result.authenticated));
    state.csrfToken = result.csrfToken;
    if (result.authenticated) await loadArtworks();
  }).catch((error) => {
    setAuthenticated(false);
    showNotice("loginNotice", `Servizio non disponibile: ${error.message}`);
  });
})();
