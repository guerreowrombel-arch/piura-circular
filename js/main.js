// Interacciones visuales compartidas
document.addEventListener("DOMContentLoaded", () => {
  const collectionMapElement = document.querySelector("#collection-map");
  const collectionList = document.querySelector("[data-collection-results]");
  const collectionCount = document.querySelector("[data-collection-count]");
  const collectionEmpty = document.querySelector("[data-collection-empty]");
  const collectionUnavailable = document.querySelector(
    "[data-collection-unavailable]",
  );
  const departmentFilter = document.querySelector(
    '[data-collection-filter="department"]',
  );
  const categoryFilter = document.querySelector(
    '[data-collection-filter="category"]',
  );
  const collectionSearch = document.querySelector("[data-collection-search]");
  const useLocationButton = document.querySelector("[data-use-location]");
  const locationStatus = document.querySelector("[data-location-status]");
  let collectionMap;
  let collectionMarkerLayer;
  let collectionMarkerIcon;
  let collectionPoints = [];
  let userLocation;
  let pointDistances = new Map();
  const collectionMarkers = new Map();
  const collectionCardPoints = new WeakMap();
  const categoryNames = new Map([
    [1, "Grandes electrodomésticos"],
    [2, "Pequeños electrodomésticos"],
    [3, "Informática y telecomunicaciones"],
    [4, "Electrónica de consumo"],
    [5, "Aparatos de alumbrado"],
    [6, "Herramientas eléctricas y electrónicas"],
    [7, "Juguetes y equipos deportivos"],
    [8, "Equipos médicos"],
    [9, "Instrumentos de vigilancia y control"],
    [10, "Máquinas expendedoras"],
  ]);
  const normalizeText = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .trim();
  const haversineDistanceKm = (first, second) => {
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(second.lat - first.lat);
    const longitudeDelta = radians(second.lng - first.lng);
    const firstLatitude = radians(first.lat);
    const secondLatitude = radians(second.lat);
    const haversine = Math.min(
      1,
      Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(firstLatitude) *
          Math.cos(secondLatitude) *
          Math.sin(longitudeDelta / 2) ** 2,
    );
    const centralAngle =
      2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return 6371 * centralAngle;
  };
  const updatePointDistances = () => {
    pointDistances = new Map(
      userLocation
        ? collectionPoints.map((point) => [
            point,
            haversineDistanceKm(userLocation, {
              lat: point.lat,
              lng: point.lng,
            }),
          ])
        : [],
    );
  };

  if (collectionMapElement) {
    const mapUnavailable = document.querySelector("[data-map-unavailable]");
    if (!window.L) {
      console.error("Leaflet no se cargó; se mostrarán indicaciones alternativas.");
      if (mapUnavailable) mapUnavailable.hidden = false;
    } else {
      collectionMap = window.L
        .map(collectionMapElement, { scrollWheelZoom: false })
        .setView([-5.19, -80.63], 12);
      window.L
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })
        .addTo(collectionMap);
      collectionMarkerIcon = window.L.divIcon({
        className: "collection-div-icon",
        html: '<span class="collection-marker" aria-hidden="true"></span>',
        iconSize: [24, 32],
        iconAnchor: [12, 29],
        popupAnchor: [0, -27],
      });
      collectionMarkerLayer = window.L.markerClusterGroup
        ? window.L.markerClusterGroup({
            maxClusterRadius: 45,
            showCoverageOnHover: false,
          }).addTo(collectionMap)
        : window.L.featureGroup().addTo(collectionMap);
    }
  }

  const categoryText = (point) =>
    point.categories
      .map((category) => categoryNames.get(category))
      .filter(Boolean)
      .join(", ") || "Sin categoría declarada";

  const appendDetail = (card, label, value) => {
    if (!value) return;
    const detail = document.createElement("div");
    const detailLabel = document.createElement("b");
    const detailValue = document.createElement("span");
    detail.className = "collection-detail";
    detailLabel.textContent = label;
    detailValue.textContent = value;
    detail.append(detailLabel, detailValue);
    card.append(detail);
  };

  const createCollectionCard = (point, index) => {
    const card = document.createElement("article");
    const top = document.createElement("div");
    const number = document.createElement("span");
    const department = document.createElement("span");
    const title = document.createElement("h2");
    const address = document.createElement("p");
    const directions = document.createElement("a");
    const departmentName =
      !point.department || point.department.trim() === "-"
        ? "Sin especificar"
        : point.department.trim();
    const addressText = normalizeText(point.address || "");
    const locationParts = new Map();
    [point.district, point.province, departmentName]
      .filter(Boolean)
      .filter((part) => part !== "Sin especificar")
      .forEach((part) => {
        const key = normalizeText(part);
        if (!addressText.includes(key) && !locationParts.has(key)) {
          locationParts.set(key, part);
        }
      });
    const addressParts = [point.address, ...locationParts.values()].filter(
      Boolean,
    );

    card.className = "collection-card";
    top.className = "collection-card-top";
    number.className = "collection-number";
    number.textContent = String(index + 1).padStart(3, "0");
    department.className = "tag tag-neutral";
    department.textContent = departmentName;
    title.textContent = point.name;
    address.className = "collection-address";
    address.textContent = `⌖ ${addressParts.join(" · ") || "Dirección no disponible"}`;
    top.append(number, department);
    const distance = pointDistances.get(point);
    if (Number.isFinite(distance)) {
      const distanceLabel = document.createElement("span");
      distanceLabel.className = "collection-distance";
      distanceLabel.textContent = `a ${distance.toFixed(distance < 10 ? 1 : 0)} km`;
      top.append(distanceLabel);
    }
    card.append(top, title, address);
    appendDetail(card, "Horario", point.hours || "No informado");
    appendDetail(card, "Recibe", categoryText(point));
    appendDetail(card, "Sistema", point.system);
    if (point.warning) {
      const warning = document.createElement("p");
      warning.className = "collection-data-warning";
      warning.textContent = point.warning;
      card.append(warning);
    }
    directions.className = "text-link";
    directions.href = `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=16/${point.lat}/${point.lng}`;
    directions.dataset.directions = "";
    directions.target = "_blank";
    directions.rel = "noopener noreferrer";
    directions.textContent = "Ver en el mapa ↗";
    card.append(directions);
    collectionCardPoints.set(card, point);
    return card;
  };

  const createCollectionMarker = (point) => {
    const popup = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = point.name;
    popup.append(title);
    if (point.address) {
      const address = document.createElement("p");
      address.textContent = point.address;
      popup.append(address);
    }
    const schedule = document.createElement("p");
    schedule.textContent = `Horario: ${point.hours || "No informado"}`;
    popup.append(schedule);
    const categories = document.createElement("p");
    categories.textContent = `Recibe: ${categoryText(point)}`;
    popup.append(categories);
    if (point.warning) {
      const warning = document.createElement("p");
      warning.textContent = point.warning;
      popup.append(warning);
    }
    const marker = window.L.marker([point.lat, point.lng], {
      alt: point.name,
      icon: collectionMarkerIcon,
      title: point.name,
    }).bindPopup(popup);
    collectionMarkers.set(point, marker);
    return marker;
  };

  const updateCollectionResults = (fitMap = true) => {
    if (!collectionList) return;
    const selectedDepartment = normalizeText(departmentFilter?.value || "");
    const selectedCategory = Number(categoryFilter?.value || 0);
    const query = normalizeText(collectionSearch?.value || "");
    const matchingPoints = collectionPoints.filter((point) => {
      const department =
        !point.department || point.department.trim() === "-"
          ? "Sin especificar"
          : point.department;
      const matchesDepartment =
        !selectedDepartment ||
        normalizeText(department) === selectedDepartment;
      const matchesCategory =
        !selectedCategory || point.categories.includes(selectedCategory);
      const searchableText = normalizeText(
        [
          point.name,
          point.address,
          point.district,
          point.province,
          department,
          point.system,
          categoryText(point),
        ].join(" "),
      );
      return (
        matchesDepartment &&
        matchesCategory &&
        (!query || searchableText.includes(query))
      );
    });
    if (userLocation) {
      matchingPoints.sort(
        (first, second) =>
          pointDistances.get(first) - pointDistances.get(second),
      );
    }

    const cards = document.createDocumentFragment();
    matchingPoints.forEach((point, index) => {
      cards.append(createCollectionCard(point, index));
    });
    collectionList.replaceChildren(cards);
    if (collectionEmpty) collectionEmpty.hidden = matchingPoints.length > 0;
    if (collectionCount) {
      collectionCount.textContent = `${matchingPoints.length} ${
        matchingPoints.length === 1 ? "punto encontrado" : "puntos encontrados"
      }`;
    }

    if (!collectionMap || !collectionMarkerLayer) return;
    const markers = matchingPoints
      .map((point) => collectionMarkers.get(point))
      .filter(Boolean);
    collectionMap.stop();
    collectionMarkerLayer.clearLayers();
    if (typeof collectionMarkerLayer.addLayers === "function") {
      collectionMarkerLayer.addLayers(markers);
    } else {
      markers.forEach((marker) => collectionMarkerLayer.addLayer(marker));
    }
    if (!markers.length) return;

    const bounds = collectionMarkerLayer.getBounds();
    if (fitMap && bounds.isValid()) {
      collectionMap.fitBounds(bounds, {
        animate: false,
        maxZoom: 14,
        padding: [28, 28],
      });
    }
  };

  const loadCollectionPoints = async () => {
    if (!collectionList) return;
    try {
      const response = await fetch("assets/data/raee-points.json");
      if (!response.ok) {
        throw new Error(`La solicitud de puntos respondió ${response.status}.`);
      }
      const points = await response.json();
      if (
        !Array.isArray(points) ||
        points.some(
          (point) =>
            !point.name ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lng) ||
            !Array.isArray(point.categories),
        )
      ) {
        throw new Error("El archivo de puntos tiene un formato no válido.");
      }
      collectionPoints = points;
      updatePointDistances();

      const departments = new Map();
      collectionPoints.forEach((point) => {
        const name =
          !point.department || point.department.trim() === "-"
            ? "Sin especificar"
            : point.department.trim();
        const key = normalizeText(name);
        if (!departments.has(key)) departments.set(key, name);
      });
      [...departments.entries()]
        .sort((first, second) =>
          first[1].localeCompare(second[1], "es", { sensitivity: "base" }),
        )
        .forEach(([value, label]) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          departmentFilter?.append(option);
        });
      if (departmentFilter) departmentFilter.value = "piura";

      if (collectionMap && collectionMarkerLayer) {
        const markers = collectionPoints.map(createCollectionMarker);
        if (typeof collectionMarkerLayer.addLayers === "function") {
          collectionMarkerLayer.addLayers(markers);
        } else {
          markers.forEach((marker) => collectionMarkerLayer.addLayer(marker));
        }
      }
      updateCollectionResults(false);
    } catch (error) {
      console.error("No se pudieron cargar los puntos de acopio RAEE.", error);
      if (collectionUnavailable) collectionUnavailable.hidden = false;
      if (collectionCount) collectionCount.textContent = "Puntos no disponibles";
    }
  };

  departmentFilter?.addEventListener("change", updateCollectionResults);
  categoryFilter?.addEventListener("change", updateCollectionResults);
  collectionSearch?.addEventListener("input", updateCollectionResults);
  document
    .querySelector("[data-collection-reset]")
    ?.addEventListener("click", () => {
      if (departmentFilter) departmentFilter.value = "";
      if (categoryFilter) categoryFilter.value = "";
      if (collectionSearch) collectionSearch.value = "";
      updateCollectionResults();
    });
  useLocationButton?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      if (locationStatus) {
        locationStatus.textContent =
          "Tu navegador no permite obtener la ubicación. La lista se mantiene sin cambios.";
        locationStatus.hidden = false;
      }
      return;
    }

    useLocationButton.disabled = true;
    useLocationButton.textContent = "Buscando ubicación…";
    if (locationStatus) locationStatus.hidden = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        updatePointDistances();
        if (locationStatus) {
          locationStatus.textContent =
            "Puntos ordenados desde tu ubicación, del más cercano al más lejano.";
          locationStatus.hidden = false;
        }
        updateCollectionResults();
        useLocationButton.disabled = false;
        useLocationButton.textContent = "Actualizar mi ubicación";
      },
      (error) => {
        if (error.code === 1) {
          console.warn("El usuario denegó el acceso a su ubicación.");
        } else {
          console.error("No se pudo obtener la ubicación del usuario.", error);
        }
        if (locationStatus) {
          locationStatus.textContent =
            error.code === 1
              ? "No autorizaste el acceso a tu ubicación. La lista se mantiene sin cambios."
              : "No se pudo obtener tu ubicación. La lista se mantiene sin cambios.";
          locationStatus.hidden = false;
        }
        useLocationButton.disabled = false;
        useLocationButton.textContent = "Usar mi ubicación";
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 },
    );
  });
  void loadCollectionPoints();

  const menuButton = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector(".main-nav");
  menuButton?.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuButton.setAttribute(
      "aria-label",
      isOpen ? "Abrir menú" : "Cerrar menú",
    );
    mainNav?.classList.toggle("is-open", !isOpen);
  });

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const initializeCounters = async () => {
    const counters = [...document.querySelectorAll("[data-count]")];
    if (!counters.length) return;

    const counts = {
      published: 0,
      operational: 0,
      collection: 0,
      districts: 0,
    };

    try {
      const storedPublications = localStorage.getItem("publicaciones");
      const publications = storedPublications
        ? JSON.parse(storedPublications)
        : [];
      if (!Array.isArray(publications)) {
        throw new Error("El contenido guardado en publicaciones no es válido.");
      }

      counts.published = publications.length;
      counts.operational = publications.filter(
        (publication) => publication?.condition === "Operativo",
      ).length;
      counts.collection = publications.filter(
        (publication) => publication?.condition === "No reutilizable",
      ).length;
    } catch (error) {
      console.error("No se pudieron calcular los contadores de publicaciones.", error);
    }

    if (counters.some((counter) => counter.dataset.countSource === "districts")) {
      try {
        const response = await fetch("assets/data/raee-points.json");
        if (!response.ok) {
          throw new Error(`La solicitud de puntos respondió ${response.status}.`);
        }

        const points = await response.json();
        if (!Array.isArray(points)) {
          throw new Error("El catálogo de puntos RAEE no tiene un formato válido.");
        }

        counts.districts = new Set(
          points
            .map((point) => normalizeText(point?.district || ""))
            .filter(Boolean),
        ).size;
      } catch (error) {
        console.error("No se pudieron calcular los distritos del catálogo RAEE.", error);
      }
    }

    counters.forEach((counter) => {
      const source = counter.dataset.countSource;
      counter.dataset.count = String(counts[source] ?? 0);
      counter.textContent = "0";
    });

    const animateCount = (element) => {
      const target = Number(element.dataset.count || 0);
      const duration = 1000;
      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        element.textContent = String(
          Math.round(target * (1 - Math.pow(1 - progress, 3))),
        );
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if ("IntersectionObserver" in window) {
      const counterObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animateCount(entry.target);
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 },
      );
      counters.forEach((counter) => counterObserver.observe(counter));
    } else counters.forEach(animateCount);
  };
  initializeCounters();

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute(
        "aria-label",
        show ? "Ocultar contraseña" : "Mostrar contraseña",
      );
    });
  });

  const strengthInput = document.querySelector("[data-strength-input]");
  if (strengthInput) {
    const meter = document.querySelector(".strength-meter");
    const label = document.querySelector(".strength-label");
    strengthInput.addEventListener("input", () => {
      const value = strengthInput.value;
      let score = 0;
      if (value.length >= 8) score += 1;
      if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
      if (/\d/.test(value)) score += 1;
      if (/[^A-Za-z0-9]/.test(value)) score += 1;
      meter.dataset.level = String(score);
      label.textContent = !value
        ? "Usa al menos 8 caracteres"
        : ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte"][score];
    });
  }

  document.querySelectorAll("[data-auth-register], [data-auth-login]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const notice = form.querySelector(".form-notice");
      const submitButton = form.querySelector('button[type="submit"]');
      const isRegistration = form.matches("[data-auth-register]");
      const formData = new FormData(form);
      const password = String(formData.get("password") || "");
      if (
        isRegistration &&
        password !== String(formData.get("confirm-password") || "")
      ) {
        if (notice) notice.textContent = "Las contraseñas no coinciden.";
        return;
      }

      const payload = {
        email: String(formData.get("email") || ""),
        password,
      };
      if (isRegistration) {
        payload.nombre = String(formData.get("nombre") || "");
        payload.apellidos = String(formData.get("apellidos") || "");
        payload.distrito = String(formData.get("distrito") || "");
      }

      if (submitButton) submitButton.disabled = true;
      if (notice) notice.textContent = "Enviando…";
      try {
        const response = await fetch(
          isRegistration ? "/api/registro" : "/api/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload),
          },
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "No se pudo completar la solicitud.");
        }

        if (notice) {
          notice.textContent = isRegistration
            ? "Cuenta creada. Redirigiendo…"
            : "Sesión iniciada. Redirigiendo…";
        }
        window.location.assign("index.html");
      } catch (error) {
        console.error("No se pudo completar la autenticación.", error);
        if (notice) {
          notice.textContent =
            error instanceof Error
              ? error.message
              : "No se pudo conectar. Inténtalo de nuevo.";
        }
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  });

  const authenticatedNavigation = document.querySelectorAll("[data-auth-nav]");
  if (authenticatedNavigation.length) {
    fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "No se pudo comprobar la sesión.");
        }
        if (!result.user) return;

        authenticatedNavigation.forEach((navigation) => {
          const logoutButton = document.createElement("button");
          logoutButton.type = "button";
          logoutButton.className = "button button-small";
          logoutButton.dataset.authLogout = "";
          logoutButton.textContent = "Cerrar sesión";
          navigation.replaceChildren(logoutButton);
        });
      })
      .catch((error) => {
        console.error("No se pudo consultar la sesión actual.", error);
      });
  }

  document.addEventListener("click", async (event) => {
    const clickedElement =
      event.target instanceof Element ? event.target : null;
    const logoutButton = clickedElement?.closest("[data-auth-logout]");
    if (!logoutButton) return;

    logoutButton.disabled = true;
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "No se pudo cerrar la sesión.");
      }
      window.location.reload();
    } catch (error) {
      console.error("No se pudo cerrar la sesión.", error);
      logoutButton.disabled = false;
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo cerrar la sesión. Inténtalo de nuevo.";
      if (document.querySelector("[data-toast]")) showToast(message);
      else window.alert(message);
    }
  });

  const publishForm = document.querySelector("[data-publish-form]");
  const publishResult = document.querySelector("[data-publish-result]");
  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error(`No se pudo leer la imagen ${file.name}.`));
        }
      });
      reader.addEventListener("error", () =>
        reject(new Error(`No se pudo leer la imagen ${file.name}.`)),
      );
      reader.readAsDataURL(file);
    });

  const renderPublishResult = (publication) => {
    if (!publishResult) return;
    const eyebrow = document.createElement("p");
    const heading = document.createElement("h2");
    const summary = document.createElement("p");
    const nextStep = document.createElement("p");
    const details = [publication.brand, publication.age].filter(Boolean);

    publishResult.replaceChildren();
    publishResult.hidden = false;
    eyebrow.className = "eyebrow";
    eyebrow.textContent = `Siguiente paso · ${publication.condition}`;
    heading.textContent = publication.category;
    summary.textContent = details.length
      ? `${details.join(" · ")} — ${publication.description}`
      : publication.description;
    publishResult.append(eyebrow, heading, summary);

    publication.photos.forEach((photo, index) => {
      const image = document.createElement("img");
      image.src = photo;
      image.alt = `Foto ${index + 1} de ${publication.category}`;
      publishResult.append(image);
    });

    if (publication.condition === "Operativo") {
      const link = document.createElement("a");
      link.className = "button";
      link.href = "intercambio.html";
      link.textContent = "Ver en Intercambio";
      nextStep.append(link);
    } else if (publication.condition === "Requiere reparación") {
      nextStep.textContent = "Llévalo a un técnico o taller local";
    } else {
      const link = document.createElement("a");
      link.className = "button";
      link.href = "puntos-acopio.html";
      link.textContent = "Ver puntos de acopio";
      nextStep.append(link);
    }

    nextStep.className = "publish-result-next-step";
    publishResult.append(nextStep);
  };

  publishForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const notice = publishForm.querySelector(".form-notice");
    const submitButton = publishForm.querySelector('button[type="submit"]');
    const photoInput = publishForm.querySelector("[data-photo-input]");
    const photos = [...(photoInput?.files || [])];

    if (photos.length > 5) {
      if (notice) notice.textContent = "Selecciona un máximo de 5 fotografías.";
      return;
    }
    if (photos.some((photo) => !photo.type.startsWith("image/"))) {
      if (notice) notice.textContent = "Selecciona solo archivos de imagen.";
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (notice) notice.textContent = "Guardando publicación…";

    try {
      const formData = new FormData(publishForm);
      const publication = {
        category: String(formData.get("category") || ""),
        brand: String(formData.get("brand") || "").trim(),
        age: String(formData.get("age") || ""),
        description: String(formData.get("description") || "").trim(),
        condition: String(formData.get("condition") || ""),
        photos: await Promise.all(photos.map(readFileAsDataUrl)),
        createdAt: new Date().toISOString(),
      };
      const storedPublications = localStorage.getItem("publicaciones");
      const publications = storedPublications
        ? JSON.parse(storedPublications)
        : [];
      if (!Array.isArray(publications)) {
        throw new Error("El contenido guardado en publicaciones no es válido.");
      }

      publications.push(publication);
      localStorage.setItem("publicaciones", JSON.stringify(publications));
      renderPublishResult(publication);
      if (notice) notice.textContent = "Publicación guardada en este navegador.";
      publishResult?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
    } catch (error) {
      console.error("No se pudo guardar la publicación.", error);
      if (notice) {
        notice.textContent =
          "No se pudo guardar. Revisa el almacenamiento del navegador e inténtalo de nuevo.";
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  const photoInput = document.querySelector("[data-photo-input]");
  const photoPreview = document.querySelector("[data-photo-preview]");
  const photoObjectUrls = [];
  photoInput?.addEventListener("change", () => {
    photoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrls.length = 0;
    photoPreview?.replaceChildren();
    const notice = publishForm?.querySelector(".form-notice");
    if (photoInput.files.length > 5) {
      if (notice) notice.textContent = "Selecciona un máximo de 5 fotografías.";
      return;
    }
    if (notice) notice.textContent = "";
    [...photoInput.files].slice(0, 5).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const image = document.createElement("img");
      image.alt = `Vista previa: ${file.name}`;
      image.src = URL.createObjectURL(file);
      photoObjectUrls.push(image.src);
      photoPreview?.append(image);
    });
  });

  document.querySelectorAll(".condition-option input").forEach((input) => {
    input.addEventListener("change", () => {
      document
        .querySelectorAll(".condition-option")
        .forEach((option) => option.classList.remove("is-selected"));
      input.closest(".condition-option")?.classList.add("is-selected");
    });
  });

  const toast = document.querySelector("[data-toast]");
  let toastTimer;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };

  const filterSelects = [...document.querySelectorAll("[data-filter]")];
  const searchInput = document.querySelector("[data-search-input]");
  const filterList = document.querySelector("[data-filter-list]");
  const resultCount = document.querySelector("[data-result-count]");
  const emptyState = document.querySelector("[data-empty-state]");
  const applyFilters = () => {
    if (!filterList) return;
    const cards = [...filterList.children].filter((item) =>
      item.matches("[data-category], [data-district]"),
    );
    let visible = 0;
    cards.forEach((card) => {
      const matchesSelects = filterSelects.every((select) => {
        const key = select.dataset.filter;
        const value = select.value.toLocaleLowerCase();
        const content = (card.dataset[key] || "").toLocaleLowerCase();
        return !value || content.includes(value);
      });
      const query = (searchInput?.value || "").trim().toLocaleLowerCase();
      const matchesSearch =
        !query ||
        (card.dataset.search || card.textContent)
          .toLocaleLowerCase()
          .includes(query);
      const matches = matchesSelects && matchesSearch;
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    if (emptyState) emptyState.hidden = visible !== 0;
    if (resultCount)
      resultCount.textContent = `${visible} ${visible === 1 ? "equipo" : "equipos"}`;
  };
  filterSelects.forEach((select) =>
    select.addEventListener("change", applyFilters),
  );
  searchInput?.addEventListener("input", applyFilters);
  document
    .querySelector("[data-filter-reset]")
    ?.addEventListener("click", () => {
      filterSelects.forEach((select) => {
        select.value = "";
      });
      if (searchInput) searchInput.value = "";
      applyFilters();
    });

  const reportModal = document.querySelector("[data-report-modal]");
  document.querySelectorAll("[data-report-trigger]").forEach((button) => {
    button.addEventListener("click", () => reportModal?.showModal());
  });
  reportModal?.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    reportModal.close();
    showToast("Reporte registrado en esta demostración visual.");
  });
  document.querySelectorAll("[data-contact]").forEach((button) => {
    button.addEventListener("click", () =>
      showToast(
        `La mensajería con ${button.dataset.contact} es una demostración visual.`,
      ),
    );
  });
  document
    .querySelector("[data-send-message]")
    ?.addEventListener("click", () => {
      const input = document.querySelector("[data-message-input]");
      if (input?.value.trim()) {
        showToast("Mensaje de demostración preparado. No se envió.");
        input.value = "";
      } else showToast("Escribe un mensaje para continuar.");
    });
  document
    .querySelector("[data-rating-trigger]")
    ?.addEventListener("click", () =>
      showToast("Las calificaciones son parte de esta demostración visual."),
    );
  collectionList?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("[data-directions]");
    if (!link || !collectionList.contains(link)) return;

    const card = link.closest(".collection-card");
    const point = card && collectionCardPoints.get(card);
    const marker = point && collectionMarkers.get(point);
    if (!collectionMap || !collectionMapElement || !card || !marker) return;

    event.preventDefault();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const mapBounds = collectionMapElement.getBoundingClientRect();
    if (mapBounds.bottom < 0 || mapBounds.top > window.innerHeight) {
      collectionMapElement.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
    }

    const focusMarker = () => {
      collectionMap.flyTo(marker.getLatLng(), 15, {
        animate: !prefersReducedMotion,
        duration: 1.2,
      });
      marker.openPopup();
    };
    if (typeof collectionMarkerLayer.zoomToShowLayer === "function") {
      collectionMarkerLayer.zoomToShowLayer(marker, focusMarker);
    } else {
      focusMarker();
    }
  });

  document.querySelectorAll("[data-accordion] details").forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (!detail.open) return;
      document.querySelectorAll("[data-accordion] details").forEach((other) => {
        if (other !== detail) other.open = false;
      });
    });
  });
});
