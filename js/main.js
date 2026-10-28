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
  let collectionSourceWarning;
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
    if (collectionSourceWarning) {
      collectionList.prepend(collectionSourceWarning);
    }
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
      collectionPoints = [...points];
      try {
        const institutionalResponse = await fetch("/api/puntos", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const institutionalResult = await institutionalResponse
          .json()
          .catch(() => ({}));
        if (!institutionalResponse.ok) {
          throw new Error(
            institutionalResult.error ||
              `La solicitud de puntos institucionales respondió ${institutionalResponse.status}.`,
          );
        }
        if (!Array.isArray(institutionalResult.puntos)) {
          throw new Error("La respuesta de puntos institucionales no es válida.");
        }
        institutionalResult.puntos.forEach((point) => {
          const lat = Number(point.lat);
          const lng = Number(point.lng);
          if (
            !point.nombre ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            !Array.isArray(point.categorias)
          ) {
            throw new Error("Un punto institucional tiene datos no válidos.");
          }
          collectionPoints.push({
            name: String(point.nombre),
            address: String(point.direccion || ""),
            district: String(point.distrito || ""),
            province: "Piura",
            department: "Piura",
            hours: String(point.horario || ""),
            categories: point.categorias,
            system: point.entidadNombre
              ? `Punto de ${point.entidadNombre}`
              : "Punto institucional",
            lat,
            lng,
          });
        });
      } catch (error) {
        console.error("No se pudieron cargar los puntos institucionales.", error);
        collectionSourceWarning = document.createElement("p");
        collectionSourceWarning.className = "collection-data-warning";
        collectionSourceWarning.textContent =
          "No se pudieron cargar los puntos de entidades. Se muestra el catálogo general.";
      }
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

    const counts = { published: 0, operational: 0, collection: 0, districts: 0 };

    if (
      counters.some((counter) =>
        ["published", "operational", "collection"].includes(
          counter.dataset.countSource,
        ),
      )
    ) {
      try {
        const response = await fetch("/api/publicaciones?summary=1", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`La solicitud de publicaciones respondió ${response.status}.`);
        }
        const result = await response.json();
        if (!result.counts || typeof result.counts !== "object") {
          throw new Error("La respuesta de publicaciones no tiene un formato válido.");
        }
        ["published", "operational", "collection"].forEach((key) => {
          const value = Number(result.counts[key]);
          if (!Number.isInteger(value) || value < 0) {
            throw new Error(`El contador ${key} no es válido.`);
          }
          counts[key] = value;
        });
      } catch (error) {
        console.error("No se pudieron calcular los contadores de publicaciones.", error);
      }
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

  let refreshPendingRatingBadges = () => {};
  const institutionalPage = document.querySelector("[data-institutional-page]");
  const profilePage = document.querySelector("[data-profile-page]");
  if (profilePage) {
    const loadingStatus = document.querySelector("[data-profile-loading]");
    const profileContent = profilePage.querySelector("[data-profile-content]");
    const profileNotice = profilePage.querySelector("[data-profile-notice]");
    const personalForm = profilePage.querySelector("[data-profile-form]");
    const passwordForm = profilePage.querySelector("[data-password-form]");
    const deleteForm = profilePage.querySelector("[data-delete-account-form]");
    const deleteDialog = profilePage.querySelector("[data-delete-account-dialog]");
    const deliveryDialog = profilePage.querySelector("[data-delivery-dialog]");
    const deliveryForm = profilePage.querySelector("[data-delivery-form]");
    const deliverySelect = deliveryForm?.elements.namedItem("entregadaA");
    const deliverySubmit = deliveryForm?.querySelector("[data-delivery-submit]");
    const deliveryError = deliveryDialog?.querySelector("[data-delivery-error]");
    const deliveryStatus = deliveryDialog?.querySelector("[data-delivery-status]");
    const publicationList = profilePage.querySelector("[data-my-publications]");
    const emptyPublications = profilePage.querySelector(
      "[data-my-publications-empty]",
    );
    const pendingRatingsList = profilePage.querySelector("[data-pending-ratings]");
    const pendingRatingsStatus = profilePage.querySelector(
      "[data-pending-ratings-status]",
    );
    const emptyPendingRatings = profilePage.querySelector(
      "[data-pending-ratings-empty]",
    );
    const reputationComments = profilePage.querySelector(
      "[data-reputation-comments]",
    );
    const noReputationComments = profilePage.querySelector(
      "[data-no-reputation-comments]",
    );
    const profileState = { profile: null, impact: null, publications: [] };
    let deliveryPublication;
    let deliveryRequest = 0;
    const setProfileNotice = (message, isError = false) => {
      if (!profileNotice) return;
      profileNotice.textContent = message;
      profileNotice.dataset.state = isError ? "error" : "success";
      profileNotice.hidden = !message;
    };
    const readProfileResponse = async (response) => {
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.assign("login.html");
        throw new Error("Redirigiendo al inicio de sesión.");
      }
      if (!response.ok) {
        throw new Error(result.error || "No se pudo completar la solicitud.");
      }
      return result;
    };
    const updateProfileDisplay = (profile) => {
      profileState.profile = profile;
      const fullName = [profile.nombre, profile.apellidos]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(" ");
      const initial = profilePage.querySelector("[data-profile-initial]");
      const name = profilePage.querySelector("[data-profile-name]");
      const district = profilePage.querySelector("[data-profile-district]");
      const entityDetails = profilePage.querySelector("[data-profile-entity]");
      if (initial) initial.textContent = String(profile.nombre || "U").charAt(0).toLocaleUpperCase();
      if (name) name.textContent = fullName;
      if (district) district.textContent = profile.distrito || "";
      if (personalForm) {
        personalForm.elements.namedItem("nombre").value = profile.nombre || "";
        personalForm.elements.namedItem("apellidos").value =
          profile.apellidos || "";
        personalForm.elements.namedItem("distrito").value =
          profile.distrito || "";
        personalForm.elements.namedItem("email").value = profile.email || "";
      }
      if (entityDetails) {
        entityDetails.hidden = profile.rol !== "entidad";
        const entityName = entityDetails.querySelector("[data-entity-name]");
        const entityPlan = entityDetails.querySelector("[data-entity-plan]");
        if (entityName) {
          entityName.textContent = profile.entidad?.nombre || "Entidad";
        }
        if (entityPlan) {
          entityPlan.textContent = profile.entidad?.plan || "";
        }
      }
      const deleteZone = profilePage.querySelector("[data-delete-account-zone]");
      if (deleteZone) deleteZone.hidden = profile.rol === "entidad";
    };
    const updateImpact = (impact) => {
      profileState.impact = impact;
      [
        ["publicadas", impact.publicadas],
        ["reutilizadas", impact.reutilizadas],
        ["acopio", impact.derivadasAcopio],
      ].forEach(([key, value]) => {
        const node = profilePage.querySelector(`[data-impact="${key}"]`);
        if (node) node.textContent = String(Math.max(0, Number(value) || 0));
      });
    };
    const loadProfileData = async () => {
      const response = await fetch("/api/perfil", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await readProfileResponse(response);
      if (!result.perfil || !result.impacto || !result.reputacion) {
        throw new Error("La respuesta del perfil no tiene un formato válido.");
      }
      updateProfileDisplay(result.perfil);
      updateImpact(result.impacto);
      updateReputation(result.reputacion);
    };
    const updateReputation = (reputation) => {
      const average = Math.min(5, Math.max(0, Number(reputation.promedio) || 0));
      const total = Math.max(0, Math.floor(Number(reputation.total) || 0));
      const averageNode = profilePage.querySelector("[data-reputation-average]");
      const starsNode = profilePage.querySelector("[data-reputation-stars]");
      const totalNode = profilePage.querySelector("[data-reputation-total]");
      if (averageNode) averageNode.textContent = average.toFixed(1);
      if (starsNode) {
        const filledStars = Math.round(average);
        starsNode.textContent =
          "★".repeat(filledStars) + "☆".repeat(5 - filledStars);
        starsNode.setAttribute(
          "aria-label",
          total
            ? `Promedio de ${average.toFixed(1)} de 5 estrellas`
            : "Aún sin calificaciones",
        );
      }
      if (totalNode) {
        totalNode.textContent = `${total} ${
          total === 1 ? "calificación" : "calificaciones"
        }`;
      }

      const comments = Array.isArray(reputation.comentarios)
        ? reputation.comentarios
        : [];
      if (!reputationComments) return;
      const entries = document.createDocumentFragment();
      comments.forEach((comment) => {
        const item = document.createElement("li");
        const header = document.createElement("div");
        const author = document.createElement("strong");
        const stars = document.createElement("span");
        const text = document.createElement("p");
        const date = document.createElement("time");
        item.className = "profile-review";
        header.className = "profile-review-heading";
        author.textContent = String(comment.autor || "Usuario");
        stars.className = "profile-review-stars";
        stars.textContent = `${Math.max(1, Math.min(5, Number(comment.estrellas) || 0))} ★`;
        stars.setAttribute("aria-label", `${comment.estrellas} de 5 estrellas`);
        header.append(author, stars);
        text.textContent = String(comment.comentario || "Sin comentario.");
        if (comment.fecha) {
          date.dateTime = String(comment.fecha);
          date.textContent = formatPublicationDate(comment.fecha);
        }
        item.append(header, text);
        if (date.textContent) item.append(date);
        entries.append(item);
      });
      reputationComments.replaceChildren(entries);
      if (noReputationComments) noReputationComments.hidden = comments.length > 0;
    };
    const formatPublicationDate = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Fecha no disponible";
      return new Intl.DateTimeFormat("es-PE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
    };
    const renderMyPublications = (publications) => {
      profileState.publications = publications;
      if (!publicationList) return;
      const cards = document.createDocumentFragment();
      publications.forEach((publication) => {
        const card = document.createElement("article");
        const imageFrame = document.createElement("div");
        const details = document.createElement("div");
        const category = document.createElement("p");
        const title = document.createElement("h3");
        const metadata = document.createElement("p");
        const condition = document.createElement("span");
        const state = document.createElement("span");
        const actions = document.createElement("div");
        card.className = "profile-publication-card";
        imageFrame.className = "profile-publication-image";
        if (
          typeof publication.foto === "string" &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(
            publication.foto,
          )
        ) {
          const image = document.createElement("img");
          image.src = publication.foto;
          image.alt = `Foto de ${publication.categoria || "la publicación"}`;
          image.width = 800;
          image.height = 800;
          image.loading = "lazy";
          image.decoding = "async";
          imageFrame.append(image);
        } else {
          const fallback = document.createElement("span");
          fallback.setAttribute("aria-hidden", "true");
          fallback.textContent = "↻";
          imageFrame.append(fallback);
        }
        details.className = "profile-publication-details";
        category.className = "profile-publication-category";
        category.textContent = String(publication.categoria || "Equipo");
        title.textContent = String(publication.marca || "Sin marca");
        metadata.className = "profile-publication-date";
        metadata.textContent = formatPublicationDate(publication.fecha);
        const tags = document.createElement("div");
        tags.className = "profile-publication-tags";
        condition.className = "profile-publication-tag";
        condition.textContent = String(publication.condicion || "");
        state.className = "profile-publication-tag";
        state.dataset.state = publication.estado;
        state.textContent =
          publication.estado === "entregada" ? "Entregada" : "Activa";
        tags.append(condition, state);
        actions.className = "profile-publication-actions";
        if (publication.estado === "activa") {
          const deliveredButton = document.createElement("button");
          deliveredButton.type = "button";
          deliveredButton.className = "profile-publication-action";
          deliveredButton.textContent = "Marcar como entregada";
          deliveredButton.addEventListener("click", () =>
            openDeliveryDialog(publication),
          );
          actions.append(deliveredButton);
        }
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className =
          "profile-publication-action profile-publication-delete";
        deleteButton.textContent = "Eliminar";
        deleteButton.addEventListener("click", async () => {
          if (
            !window.confirm(
              "¿Eliminar esta publicación? Esta acción no se puede deshacer.",
            )
          ) {
            return;
          }
          deleteButton.disabled = true;
          setProfileNotice("");
          try {
            const response = await fetch(
              `/api/mis-publicaciones?id=${encodeURIComponent(publication.id)}`,
              { method: "DELETE", credentials: "same-origin" },
            );
            await readProfileResponse(response);
            await refreshProfileAndPublications();
            setProfileNotice("Publicación eliminada.");
          } catch (error) {
            setProfileNotice(
              error instanceof Error ? error.message : "No se pudo eliminar la publicación.",
              true,
            );
          } finally {
            deleteButton.disabled = false;
          }
        });
        actions.append(deleteButton);
        details.append(category, title, metadata, tags, actions);
        card.append(imageFrame, details);
        cards.append(card);
      });
      publicationList.replaceChildren(cards);
      if (emptyPublications) {
        emptyPublications.hidden = publications.length > 0;
      }
      publicationList.hidden = publications.length === 0;
    };
    const renderPendingRatings = (pending) => {
      if (!pendingRatingsList) return;
      const cards = document.createDocumentFragment();
      pending.forEach((rating) => {
        const card = document.createElement("article");
        const title = document.createElement("h3");
        const recipient = document.createElement("p");
        const form = document.createElement("form");
        const ratingLabel = document.createElement("span");
        const ratingGroup = document.createElement("div");
        const commentLabel = document.createElement("label");
        const comment = document.createElement("textarea");
        const error = document.createElement("p");
        const submit = document.createElement("button");
        const commentId = `rating-comment-${String(rating.publicacionId)}`;
        card.className = "profile-pending-card";
        title.textContent = String(rating.titulo || "Equipo entregado");
        recipient.className = "profile-pending-recipient";
        recipient.textContent = `Califica a ${String(
          rating.otraPersona || "la otra persona",
        )}`;
        form.className = "profile-rating-form";
        ratingLabel.className = "profile-rating-label";
        ratingLabel.textContent = "Tu calificación";
        ratingGroup.className = "profile-star-selector";
        ratingGroup.setAttribute("role", "radiogroup");
        ratingGroup.setAttribute(
          "aria-label",
          `Calificación para ${String(rating.otraPersona || "la otra persona")}`,
        );
        ratingGroup.setAttribute(
          "aria-keyshortcuts",
          "ArrowLeft ArrowRight ArrowUp ArrowDown Home End",
        );
        for (let value = 1; value <= 5; value += 1) {
          const star = document.createElement("button");
          star.type = "button";
          star.className = "profile-star-button";
          star.setAttribute("role", "radio");
          star.setAttribute("aria-label", `${value} ${
            value === 1 ? "estrella" : "estrellas"
          }`);
          star.setAttribute("aria-checked", "false");
          star.tabIndex = value === 1 ? 0 : -1;
          star.dataset.ratingValue = String(value);
          star.textContent = "★";
          ratingGroup.append(star);
        }
        const setSelectedRating = (value) => {
          const stars = [...ratingGroup.querySelectorAll("[data-rating-value]")];
          ratingGroup.dataset.selected = String(value);
          stars.forEach((star) => {
            const starValue = Number(star.dataset.ratingValue);
            star.setAttribute("aria-checked", String(starValue === value));
            star.dataset.active = String(starValue <= value);
            star.tabIndex = starValue === value ? 0 : -1;
          });
        };
        ratingGroup.addEventListener("click", (event) => {
          const target =
            event.target instanceof Element
              ? event.target.closest("[data-rating-value]")
              : null;
          if (target && ratingGroup.contains(target)) {
            setSelectedRating(Number(target.dataset.ratingValue));
          }
        });
        ratingGroup.addEventListener("keydown", (event) => {
          const currentValue = Number(ratingGroup.dataset.selected) || 1;
          let nextValue = currentValue;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            nextValue = Math.min(5, currentValue + 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            nextValue = Math.max(1, currentValue - 1);
          } else if (event.key === "Home") {
            nextValue = 1;
          } else if (event.key === "End") {
            nextValue = 5;
          } else {
            return;
          }
          event.preventDefault();
          setSelectedRating(nextValue);
          ratingGroup
            .querySelector(`[data-rating-value="${nextValue}"]`)
            ?.focus();
        });

        commentLabel.htmlFor = commentId;
        commentLabel.textContent = "Comentario (opcional)";
        comment.id = commentId;
        comment.name = "comentario";
        comment.maxLength = 300;
        comment.rows = 3;
        comment.placeholder = "¿Cómo fue el intercambio?";
        error.className = "profile-rating-error";
        error.setAttribute("role", "alert");
        error.hidden = true;
        submit.type = "submit";
        submit.className = "button button-small";
        submit.textContent = "Enviar calificación";
        form.append(ratingLabel, ratingGroup, commentLabel, comment, error, submit);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const stars = Number(ratingGroup.dataset.selected) || 0;
          if (!stars) {
            error.textContent = "Selecciona de 1 a 5 estrellas.";
            error.hidden = false;
            ratingGroup.querySelector("button")?.focus();
            return;
          }
          submit.disabled = true;
          error.textContent = "";
          error.hidden = true;
          try {
            const response = await fetch("/api/calificaciones", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({
                publicacionId: rating.publicacionId,
                estrellas: stars,
                comentario: comment.value,
              }),
            });
            await readProfileResponse(response);
            setProfileNotice("Tu calificación se envió correctamente.");
            await loadPendingRatings();
            refreshPendingRatingBadges();
          } catch (requestError) {
            error.textContent =
              requestError instanceof Error
                ? requestError.message
                : "No se pudo enviar la calificación.";
            error.hidden = false;
            submit.disabled = false;
          }
        });
        card.append(title, recipient, form);
        cards.append(card);
      });
      pendingRatingsList.replaceChildren(cards);
      if (emptyPendingRatings) emptyPendingRatings.hidden = pending.length > 0;
    };
    const loadPendingRatings = async () => {
      if (pendingRatingsStatus) {
        pendingRatingsStatus.textContent = "Cargando calificaciones…";
        pendingRatingsStatus.dataset.state = "";
        pendingRatingsStatus.hidden = false;
      }
      try {
        const response = await fetch("/api/calificaciones?pendientes=1", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const result = await readProfileResponse(response);
        if (!Array.isArray(result.pendientes)) {
          throw new Error("La lista de calificaciones no tiene un formato válido.");
        }
        renderPendingRatings(result.pendientes);
        if (pendingRatingsStatus) pendingRatingsStatus.hidden = true;
      } catch (error) {
        pendingRatingsList?.replaceChildren();
        if (pendingRatingsStatus) {
          pendingRatingsStatus.textContent =
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las calificaciones pendientes.";
          pendingRatingsStatus.dataset.state = "error";
          pendingRatingsStatus.hidden = false;
        }
        if (emptyPendingRatings) emptyPendingRatings.hidden = true;
      }
    };
    const openDeliveryDialog = async (publication) => {
      deliveryPublication = publication;
      const requestId = ++deliveryRequest;
      if (deliverySelect) {
        const outsideOption = document.createElement("option");
        outsideOption.value = "";
        outsideOption.textContent =
          "Entrega fuera de la plataforma (sin calificación)";
        deliverySelect.replaceChildren(outsideOption);
        deliverySelect.disabled = true;
      }
      if (deliveryError) {
        deliveryError.textContent = "";
        deliveryError.hidden = true;
      }
      if (deliveryStatus) {
        deliveryStatus.textContent = "Cargando las personas interesadas…";
        deliveryStatus.hidden = false;
      }
      if (deliverySubmit) deliverySubmit.disabled = true;
      deliveryDialog?.showModal();
      try {
        const response = await fetch(
          `/api/mis-publicaciones?interesados=${encodeURIComponent(
            publication.id,
          )}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const result = await readProfileResponse(response);
        if (!Array.isArray(result.interesados)) {
          throw new Error("La lista de interesados no tiene un formato válido.");
        }
        if (requestId !== deliveryRequest || !deliverySelect) return;
        result.interesados.forEach((person) => {
          const option = document.createElement("option");
          option.value = String(person.id);
          option.textContent = String(person.nombre || "Usuario");
          deliverySelect.append(option);
        });
        if (deliveryStatus) {
          deliveryStatus.textContent = result.interesados.length
            ? ""
            : "No hay conversaciones con interesados para esta publicación.";
          deliveryStatus.hidden = result.interesados.length > 0;
        }
        deliverySelect.disabled = false;
        if (deliverySubmit) deliverySubmit.disabled = false;
      } catch (error) {
        if (requestId !== deliveryRequest) return;
        if (deliveryError) {
          deliveryError.textContent =
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las personas interesadas.";
          deliveryError.hidden = false;
        }
        if (deliveryStatus) deliveryStatus.hidden = true;
        if (deliverySelect) deliverySelect.disabled = false;
        if (deliverySubmit) deliverySubmit.disabled = false;
      }
    };
    deliveryForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!deliveryPublication) return;
      if (deliverySubmit) deliverySubmit.disabled = true;
      if (deliveryError) {
        deliveryError.textContent = "";
        deliveryError.hidden = true;
      }
      const entregadaA = deliverySelect?.value;
      try {
        const response = await fetch("/api/mis-publicaciones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            id: deliveryPublication.id,
            estado: "entregada",
            ...(entregadaA ? { entregadaA } : {}),
          }),
        });
        await readProfileResponse(response);
      } catch (error) {
        if (deliveryError) {
          deliveryError.textContent =
            error instanceof Error
              ? error.message
              : "No se pudo registrar la entrega.";
          deliveryError.hidden = false;
        }
        if (deliverySubmit) deliverySubmit.disabled = false;
        return;
      }

      deliveryRequest += 1;
      deliveryDialog?.close();
      setProfileNotice(
        entregadaA
          ? "Entrega registrada. Ya puedes calificar a la otra persona."
          : "Entrega registrada sin calificación.",
      );
      refreshPendingRatingBadges();
      try {
        await refreshProfileAndPublications();
        await loadPendingRatings();
      } catch (error) {
        setProfileNotice(
          error instanceof Error
            ? `La entrega se guardó, pero no se pudo actualizar el perfil: ${error.message}`
            : "La entrega se guardó, pero no se pudo actualizar el perfil.",
          true,
        );
      } finally {
        if (deliverySubmit) deliverySubmit.disabled = false;
      }
    });
    profilePage
      .querySelector("[data-close-delivery-dialog]")
      ?.addEventListener("click", () => {
        deliveryRequest += 1;
        deliveryDialog?.close();
      });
    deliveryDialog?.addEventListener("click", (event) => {
      if (event.target === deliveryDialog) {
        deliveryRequest += 1;
        deliveryDialog.close();
      }
    });
    const loadMyPublications = async () => {
      const response = await fetch("/api/mis-publicaciones", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await readProfileResponse(response);
      if (!Array.isArray(result.publicaciones)) {
        throw new Error("La lista de publicaciones no tiene un formato válido.");
      }
      renderMyPublications(result.publicaciones);
    };
    const refreshProfileAndPublications = async () => {
      await Promise.all([loadProfileData(), loadMyPublications()]);
    };

    personalForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setProfileNotice("");
      const submit = personalForm.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        const response = await fetch("/api/perfil", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            nombre: personalForm.elements.namedItem("nombre").value,
            apellidos: personalForm.elements.namedItem("apellidos").value,
            distrito: personalForm.elements.namedItem("distrito").value,
          }),
        });
        const result = await readProfileResponse(response);
        if (result.perfil) {
          updateProfileDisplay({
            ...profileState.profile,
            ...result.perfil,
          });
        }
        setProfileNotice("Tus datos se guardaron correctamente.");
      } catch (error) {
        setProfileNotice(
          error instanceof Error ? error.message : "No se pudieron guardar tus datos.",
          true,
        );
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    passwordForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setProfileNotice("");
      const actual = passwordForm.elements.namedItem("actual").value;
      const nueva = passwordForm.elements.namedItem("nueva").value;
      const confirmacion = passwordForm.elements.namedItem("confirmar").value;
      if (nueva !== confirmacion) {
        setProfileNotice("La nueva contraseña y su confirmación no coinciden.", true);
        return;
      }
      if (actual === nueva) {
        setProfileNotice("La nueva contraseña debe ser distinta de la actual.", true);
        return;
      }
      const submit = passwordForm.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        const response = await fetch("/api/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ actual, nueva }),
        });
        await readProfileResponse(response);
        passwordForm.reset();
        const meter = passwordForm.querySelector(".strength-meter");
        const strengthLabel = passwordForm.querySelector(".strength-label");
        if (meter) meter.dataset.level = "0";
        if (strengthLabel) {
          strengthLabel.textContent = "Usa al menos 8 caracteres";
        }
        setProfileNotice("Tu contraseña se actualizó correctamente.");
      } catch (error) {
        setProfileNotice(
          error instanceof Error ? error.message : "No se pudo cambiar la contraseña.",
          true,
        );
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    deleteForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = deleteForm.elements.namedItem("password").value;
      const submit = deleteForm.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      const errorNotice = deleteDialog?.querySelector("[data-delete-error]");
      if (errorNotice) {
        errorNotice.textContent = "";
        errorNotice.hidden = true;
      }
      try {
        const response = await fetch("/api/perfil", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ password }),
        });
        await readProfileResponse(response);
        window.location.assign("index.html");
      } catch (error) {
        if (errorNotice) {
          errorNotice.textContent =
            error instanceof Error ? error.message : "No se pudo eliminar la cuenta.";
          errorNotice.hidden = false;
        }
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    profilePage
      .querySelector("[data-open-delete-dialog]")
      ?.addEventListener("click", () => {
        deleteForm?.reset();
        if (deleteDialog?.querySelector("[data-delete-error]")) {
          const errorNotice = deleteDialog.querySelector("[data-delete-error]");
          errorNotice.textContent = "";
          errorNotice.hidden = true;
        }
        deleteDialog?.showModal();
      });
    profilePage
      .querySelector("[data-close-delete-dialog]")
      ?.addEventListener("click", () => deleteDialog?.close());
    deleteDialog?.addEventListener("click", (event) => {
      if (event.target === deleteDialog) deleteDialog.close();
    });

    const initializeProfilePage = async () => {
      try {
        await loadProfileData();
        await loadMyPublications();
        if (profileContent) profileContent.hidden = false;
        if (loadingStatus) loadingStatus.hidden = true;
        await loadPendingRatings();
      } catch (error) {
        if (loadingStatus) {
          loadingStatus.textContent =
            error instanceof Error ? error.message : "No se pudo cargar tu perfil.";
        }
      }
    };
    void initializeProfilePage();
  }

  if (institutionalPage) {
    const accessStatus = document.querySelector(
      "[data-institutional-access-status]",
    );
    const pageStatus = institutionalPage.querySelector(
      "[data-institutional-status]",
    );
    const pointForm = institutionalPage.querySelector("[data-point-form]");
    const pointTable = institutionalPage.querySelector(
      "[data-owned-points-body]",
    );
    const planButton = institutionalPage.querySelector("[data-change-plan]");
    const reportButton = institutionalPage.querySelector(
      "[data-download-report]",
    );
    const mapElement = institutionalPage.querySelector(
      "#institutional-point-map",
    );
    const latitudeInput = pointForm?.elements.namedItem("lat");
    const longitudeInput = pointForm?.elements.namedItem("lng");
    const coordinateStatus = institutionalPage.querySelector(
      "[data-point-coordinates]",
    );
    let institutionalStats;
    let institutionalEntity;
    let currentPlan;
    let selectedPointMarker;
    let pointMap;

    const setInstitutionalStatus = (message, isError = false) => {
      if (!pageStatus) return;
      pageStatus.textContent = message;
      pageStatus.dataset.state = isError ? "error" : "success";
      pageStatus.hidden = !message;
    };
    const readInstitutionalResponse = async (response) => {
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.assign("login.html");
        throw new Error("Redirigiendo al inicio de sesión.");
      }
      if (!response.ok) {
        throw new Error(result.error || "No se pudo completar la solicitud.");
      }
      return result;
    };
    const renderBarChart = (container, entries, emptyLabel) => {
      if (!container) return;
      const validEntries = Array.isArray(entries)
        ? entries.map((entry) => ({
            label: String(entry.mes ?? entry.distrito ?? "Sin especificar"),
            total: Math.max(0, Number(entry.total) || 0),
          }))
        : [];
      if (!validEntries.length) {
        const empty = document.createElement("li");
        empty.className = "institutional-chart-empty";
        empty.textContent = emptyLabel;
        container.replaceChildren(empty);
        return;
      }
      const maximum = Math.max(1, ...validEntries.map((entry) => entry.total));
      const rows = document.createDocumentFragment();
      validEntries.forEach(({ label, total }) => {
        const row = document.createElement("li");
        const name = document.createElement("span");
        const track = document.createElement("span");
        const bar = document.createElement("span");
        const value = document.createElement("span");
        row.className = "institutional-chart-row";
        name.className = "institutional-chart-label";
        name.textContent = label;
        track.className = "institutional-chart-track";
        bar.className = "institutional-chart-bar";
        bar.style.width = `${(total / maximum) * 100}%`;
        track.append(bar);
        value.className = "institutional-chart-value";
        value.textContent = String(total);
        value.setAttribute("aria-label", `${total} publicaciones`);
        row.append(name, track, value);
        rows.append(row);
      });
      container.replaceChildren(rows);
    };
    const renderPlan = (entity) => {
      if (!entity) return;
      institutionalEntity = entity;
      currentPlan = entity.plan === "Institucional" ? "Institucional" : "Básico";
      const name = institutionalPage.querySelector("[data-current-plan]");
      const description = institutionalPage.querySelector(
        "[data-current-plan-description]",
      );
      const basicOption = institutionalPage.querySelector(
        '[data-plan-option="Básico"]',
      );
      const institutionalOption = institutionalPage.querySelector(
        '[data-plan-option="Institucional"]',
      );
      if (name) name.textContent = currentPlan;
      if (description) {
        description.textContent = `Plan de ${entity.nombre || "la entidad"} activo.`;
      }
      basicOption?.toggleAttribute("data-plan-active", currentPlan === "Básico");
      institutionalOption?.toggleAttribute(
        "data-plan-active",
        currentPlan === "Institucional",
      );
    };
    const renderInstitutionalStats = (data) => {
      institutionalStats = data;
      const totals = data.publicaciones || {};
      [
        ["total", totals.total],
        ["operativo", totals.operativo],
        ["reparacion", totals.requiereReparacion],
        ["acopio", totals.derivadasAcopio],
      ].forEach(([key, value]) => {
        const node = institutionalPage.querySelector(`[data-stat="${key}"]`);
        if (node) node.textContent = String(Math.max(0, Number(value) || 0));
      });
      renderBarChart(
        institutionalPage.querySelector("[data-chart-months]"),
        data.porMes,
        "Aún no hay datos mensuales.",
      );
      renderBarChart(
        institutionalPage.querySelector("[data-chart-districts]"),
        data.porDistrito,
        "Aún no hay datos por distrito.",
      );
      renderPlan(data.entidad || institutionalEntity);
    };
    const showCoordinates = (lat, lng) => {
      if (latitudeInput) latitudeInput.value = String(lat);
      if (longitudeInput) longitudeInput.value = String(lng);
      if (coordinateStatus) {
        coordinateStatus.textContent = `Coordenadas seleccionadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
      if (!window.L || !pointMap) return;
      if (selectedPointMarker) selectedPointMarker.setLatLng([lat, lng]);
      else selectedPointMarker = window.L.marker([lat, lng]).addTo(pointMap);
    };
    const resetPointForm = () => {
      pointForm?.reset();
      if (latitudeInput) latitudeInput.value = "";
      if (longitudeInput) longitudeInput.value = "";
      if (selectedPointMarker && pointMap) {
        pointMap.removeLayer(selectedPointMarker);
        selectedPointMarker = null;
      }
      if (coordinateStatus) {
        coordinateStatus.textContent =
          "Haz clic en el mapa para seleccionar las coordenadas.";
      }
      const pointId = pointForm?.elements.namedItem("id");
      if (pointId) pointId.value = "";
      const submit = pointForm?.querySelector('[type="submit"]');
      if (submit) submit.textContent = "Agregar punto";
    };
    const renderOwnedPoints = (points) => {
      if (!pointTable) return;
      const rows = document.createDocumentFragment();
      if (!points.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "institutional-empty-row";
        cell.textContent = "Todavía no has agregado puntos de acopio.";
        row.append(cell);
        rows.append(row);
      }
      points.forEach((point) => {
        const row = document.createElement("tr");
        [
          point.nombre,
          point.direccion,
          point.distrito,
          point.horario || "No informado",
          point.activo ? "Activo" : "Inactivo",
        ].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = String(value ?? "—");
          row.append(cell);
        });
        const actions = document.createElement("td");
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "institutional-table-action";
        editButton.textContent = "Editar";
        editButton.addEventListener("click", () => {
          pointForm.elements.namedItem("id").value = String(point.id);
          pointForm.elements.namedItem("nombre").value = point.nombre;
          pointForm.elements.namedItem("direccion").value = point.direccion;
          pointForm.elements.namedItem("distrito").value = point.distrito;
          pointForm.elements.namedItem("horario").value = point.horario || "";
          pointForm
            .querySelectorAll('input[name="categorias"]')
            .forEach((input) => {
              input.checked = point.categorias.includes(Number(input.value));
            });
          showCoordinates(Number(point.lat), Number(point.lng));
          const submit = pointForm.querySelector('[type="submit"]');
          if (submit) submit.textContent = "Guardar cambios";
          setInstitutionalStatus(`Editando: ${point.nombre}`);
          pointForm.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        actions.append(editButton);
        const stateButton = document.createElement("button");
        stateButton.type = "button";
        stateButton.className = "institutional-table-action";
        stateButton.textContent = point.activo ? "Desactivar" : "Reactivar";
        stateButton.addEventListener("click", async () => {
          stateButton.disabled = true;
          try {
            if (point.activo) {
              const response = await fetch(
                `/api/puntos?id=${encodeURIComponent(point.id)}`,
                { method: "DELETE", credentials: "same-origin" },
              );
              await readInstitutionalResponse(response);
            } else {
              const response = await fetch("/api/puntos", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ ...point, activo: true }),
              });
              await readInstitutionalResponse(response);
            }
            await loadOwnedPoints();
            setInstitutionalStatus(
              point.activo ? "Punto desactivado." : "Punto reactivado.",
            );
          } catch (error) {
            setInstitutionalStatus(
              error instanceof Error
                ? error.message
                : "No se pudo actualizar el punto.",
              true,
            );
          } finally {
            stateButton.disabled = false;
          }
        });
        actions.append(stateButton);
        row.append(actions);
        rows.append(row);
      });
      pointTable.replaceChildren(rows);
    };
    const loadOwnedPoints = async () => {
      const response = await fetch("/api/puntos?propios=1", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await readInstitutionalResponse(response);
      if (!Array.isArray(data.puntos)) {
        throw new Error("La lista de puntos recibida no tiene un formato válido.");
      }
      renderOwnedPoints(data.puntos);
    };
    const downloadReport = () => {
      if (!institutionalStats) {
        setInstitutionalStatus(
          "Los datos del reporte aún no están disponibles.",
          true,
        );
        return;
      }
      const rows = [
        ["Sección", "Indicador", "Publicaciones"],
        ["Resumen", "Total", institutionalStats.publicaciones?.total ?? 0],
        ["Resumen", "Operativo", institutionalStats.publicaciones?.operativo ?? 0],
        [
          "Resumen",
          "Requiere reparación",
          institutionalStats.publicaciones?.requiereReparacion ?? 0,
        ],
        [
          "Resumen",
          "Derivadas a acopio",
          institutionalStats.publicaciones?.derivadasAcopio ?? 0,
        ],
        ...(institutionalStats.porMes || []).map((entry) => [
          "Mes",
          entry.mes,
          entry.total,
        ]),
        ...(institutionalStats.porDistrito || []).map((entry) => [
          "Distrito",
          entry.distrito,
          entry.total,
        ]),
      ];
      const csvCell = (value) => {
        let text = String(value ?? "");
        if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
      };
      const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "reporte-institucional-piura-circular.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    };

    categoryNames.forEach((name, category) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      const text = document.createElement("span");
      label.className = "institutional-category-option";
      checkbox.type = "checkbox";
      checkbox.name = "categorias";
      checkbox.value = String(category);
      text.textContent = name;
      label.append(checkbox, text);
      institutionalPage
        .querySelector("[data-point-categories]")
        ?.append(label);
    });
    reportButton?.addEventListener("click", downloadReport);
    planButton?.addEventListener("click", async () => {
      if (!currentPlan) return;
      const plan = currentPlan === "Básico" ? "Institucional" : "Básico";
      planButton.disabled = true;
      setInstitutionalStatus("Actualizando el plan…");
      try {
        const response = await fetch("/api/institucional", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ plan }),
        });
        const result = await readInstitutionalResponse(response);
        renderPlan(result.entidad);
        setInstitutionalStatus(`Plan actualizado a ${result.entidad.plan}.`);
        await loadOwnedPoints();
      } catch (error) {
        setInstitutionalStatus(
          error instanceof Error ? error.message : "No se pudo cambiar el plan.",
          true,
        );
      } finally {
        planButton.disabled = false;
      }
    });
    pointForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(pointForm);
      const pointId = String(formData.get("id") || "");
      const lat = Number(formData.get("lat"));
      const lng = Number(formData.get("lng"));
      if (!formData.get("lat") || !formData.get("lng")) {
        setInstitutionalStatus(
          "Selecciona la ubicación del punto en el mapa.",
          true,
        );
        return;
      }
      const payload = {
        nombre: String(formData.get("nombre") || "").trim(),
        direccion: String(formData.get("direccion") || "").trim(),
        distrito: String(formData.get("distrito") || "").trim(),
        horario: String(formData.get("horario") || "").trim(),
        categorias: formData
          .getAll("categorias")
          .map((category) => Number(category)),
        lat,
        lng,
      };
      const submit = pointForm.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      setInstitutionalStatus(
        pointId ? "Guardando cambios…" : "Agregando punto…",
      );
      try {
        const response = await fetch("/api/puntos", {
          method: pointId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(pointId ? { ...payload, id: pointId } : payload),
        });
        await readInstitutionalResponse(response);
        resetPointForm();
        await loadOwnedPoints();
        setInstitutionalStatus(
          pointId ? "Cambios guardados." : "Punto agregado.",
        );
      } catch (error) {
        setInstitutionalStatus(
          error instanceof Error ? error.message : "No se pudo guardar el punto.",
          true,
        );
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    institutionalPage
      .querySelector("[data-reset-point-form]")
      ?.addEventListener("click", resetPointForm);

    const initializeInstitutionalPage = async () => {
      try {
        const sessionResponse = await fetch("/api/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok) {
          throw new Error(session.error || "No se pudo comprobar la sesión.");
        }
        if (!session.user) {
          window.location.assign("login.html");
          return;
        }
        if (session.user.rol !== "entidad" || !session.user.entidad) {
          window.location.assign("index.html");
          return;
        }
        institutionalEntity = session.user.entidad;
        renderPlan(institutionalEntity);
        if (accessStatus) accessStatus.hidden = true;
        institutionalPage.hidden = false;
        if (window.L && mapElement) {
          pointMap = window.L
            .map(mapElement, { scrollWheelZoom: false })
            .setView([-5.19, -80.63], 12);
          window.L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
              maxZoom: 19,
            },
          ).addTo(pointMap);
          pointMap.on("click", (event) => {
            showCoordinates(event.latlng.lat, event.latlng.lng);
          });
          pointMap.invalidateSize();
          window.setTimeout(() => pointMap?.invalidateSize(), 200);
        } else if (mapElement) {
          mapElement.textContent = "No se pudo cargar el mapa de selección.";
        }
        const [statsResult, pointsResult] = await Promise.allSettled([
          fetch("/api/institucional", {
            credentials: "same-origin",
            cache: "no-store",
          })
            .then(readInstitutionalResponse)
            .then(renderInstitutionalStats),
          loadOwnedPoints(),
        ]);
        if (statsResult.status === "rejected") {
          setInstitutionalStatus(
            statsResult.reason instanceof Error
              ? statsResult.reason.message
              : "No se pudieron cargar los datos agregados.",
            true,
          );
        } else if (pointsResult.status === "rejected") {
          setInstitutionalStatus(
            pointsResult.reason instanceof Error
              ? pointsResult.reason.message
              : "No se pudieron cargar tus puntos de acopio.",
            true,
          );
        } else {
          setInstitutionalStatus("");
        }
      } catch (error) {
        console.error("No se pudo inicializar el panel institucional.", error);
        if (accessStatus) {
          accessStatus.textContent =
            error instanceof Error
              ? error.message
              : "No se pudo verificar el acceso al panel.";
          accessStatus.hidden = false;
        }
      }
    };
    void initializeInstitutionalPage();
  }

  const authenticatedNavigation = document.querySelectorAll("[data-auth-nav]");
  const sessionUserCacheKey = "piura-circular-session-user";
  let refreshUnreadNotifications = () => {};
  let authNavigationReadyTimer = null;
  const clearCachedSessionUser = () => {
    try {
      window.sessionStorage.removeItem(sessionUserCacheKey);
    } catch (error) {
      console.warn(
        "No se pudo borrar la sesión guardada para la navegación.",
        error,
      );
    }
  };
  if (authenticatedNavigation.length) {
    const markAuthenticatedNavigationReady = () => {
      if (authNavigationReadyTimer !== null) {
        window.clearTimeout(authNavigationReadyTimer);
        authNavigationReadyTimer = null;
      }
      authenticatedNavigation.forEach((navigation) =>
        navigation.classList.add("auth-ready"),
      );
    };
    const anonymousNavigationChildren = Array.from(
      authenticatedNavigation,
      (navigation) =>
        Array.from(navigation.childNodes, (child) => child.cloneNode(true)),
    );
    const restoreAnonymousNavigation = () => {
      authenticatedNavigation.forEach((navigation, index) => {
        navigation.classList.remove("has-profile-menu");
        navigation.replaceChildren(
          ...anonymousNavigationChildren[index].map((child) =>
            child.cloneNode(true),
          ),
        );
      });
    };
    const readCachedSessionUser = () => {
      try {
        const cached = JSON.parse(
          window.sessionStorage.getItem(sessionUserCacheKey) || "null",
        );
        if (
          !cached ||
          typeof cached.firstName !== "string" ||
          !cached.firstName ||
          typeof cached.initial !== "string" ||
          !["ciudadano", "entidad"].includes(cached.role)
        ) {
          return null;
        }
        return {
          firstName: cached.firstName,
          initial: cached.initial,
          role: cached.role,
        };
      } catch (error) {
        console.warn(
          "No se pudo leer la sesión guardada para la navegación.",
          error,
        );
        return null;
      }
    };
    const cacheSessionUser = (user) => {
      const firstName =
        String(user.nombre || "").trim().split(/\s+/)[0] || "Usuario";
      try {
        window.sessionStorage.setItem(
          sessionUserCacheKey,
          JSON.stringify({
            firstName,
            initial: firstName.charAt(0).toLocaleUpperCase(),
            role: user.rol === "entidad" ? "entidad" : "ciudadano",
          }),
        );
      } catch (error) {
        console.warn(
          "No se pudo guardar la sesión para la navegación.",
          error,
        );
      }
    };
    const renderAuthenticatedNavigation = (user, cached = false) => {
      const displayName = cached
        ? user.firstName
        : [user.nombre, user.apellidos]
            .map((part) => String(part || "").trim())
            .filter(Boolean)
            .join(" ") || "Usuario";
      const initialText = cached
        ? user.initial
        : displayName.charAt(0).toLocaleUpperCase();
      const badgeNodes = [];
      const profileButtons = [];
      const ratingBadgeNodes = [];

      authenticatedNavigation.forEach((navigation, index) => {
        const profileMenu = document.createElement("div");
        const profileButton = document.createElement("button");
        const initial = document.createElement("span");
        const profileBadge = document.createElement("span");
        const panel = document.createElement("div");
        const profileName = document.createElement("p");
        const profileEmail = document.createElement("p");
        const messagesLink = document.createElement("a");
        const messagesLabel = document.createElement("span");
        const messagesBadge = document.createElement("span");
        const personalProfileLink = document.createElement("a");
        const personalProfileBadge = document.createElement("span");
        const institutionalLink = document.createElement("a");
        const logoutButton = document.createElement("button");
        const panelId = `profile-menu-panel-${index + 1}`;

        profileMenu.className = "profile-menu";
        profileButton.type = "button";
        profileButton.className = "profile-trigger";
        profileButton.dataset.profileToggle = "";
        profileButton.setAttribute("aria-expanded", "false");
        profileButton.setAttribute("aria-controls", panelId);
        profileButton.setAttribute("aria-label", `Perfil de ${displayName}`);
        initial.className = "profile-initial";
        initial.textContent = initialText;
        profileBadge.className = "unread-badge profile-unread-badge";
        profileBadge.dataset.unreadBadge = "";
        profileBadge.hidden = true;
        profileBadge.setAttribute("aria-hidden", "true");
        profileButton.append(initial, profileBadge);
        profileButtons.push({ button: profileButton, displayName });

        panel.className = "profile-panel";
        panel.id = panelId;
        panel.setAttribute("aria-label", "Menú de perfil");
        panel.hidden = true;
        profileName.className = "profile-panel-name";
        profileName.textContent = displayName;
        profileEmail.className = "profile-panel-email";
        profileEmail.textContent = cached ? "" : String(user.email || "");
        panel.append(profileName, profileEmail);

        messagesLink.className = "profile-messages-link";
        messagesLink.href = "mensajes.html";
        messagesLabel.textContent = "Mensajería";
        messagesBadge.className = "unread-badge";
        messagesBadge.dataset.unreadBadge = "";
        messagesBadge.hidden = true;
        messagesBadge.setAttribute("aria-hidden", "true");
        messagesLink.append(messagesLabel, messagesBadge);
        badgeNodes.push(profileBadge, messagesBadge);
        personalProfileLink.className = "profile-personal-link";
        personalProfileLink.href = "perfil.html";
        const personalProfileLabel = document.createElement("span");
        personalProfileLabel.textContent = "Mi perfil";
        personalProfileBadge.className = "profile-rating-notice";
        personalProfileBadge.hidden = true;
        personalProfileBadge.setAttribute("aria-hidden", "true");
        personalProfileLink.append(personalProfileLabel, personalProfileBadge);
        ratingBadgeNodes.push({
          badge: personalProfileBadge,
          link: personalProfileLink,
        });
        if ((cached ? user.role : user.rol) === "entidad") {
          institutionalLink.className = "profile-institutional-link";
          institutionalLink.href = "institucional.html";
          institutionalLink.textContent = "Panel institucional";
          panel.append(institutionalLink);
        }

        logoutButton.type = "button";
        logoutButton.className = "profile-logout";
        logoutButton.dataset.authLogout = "";
        logoutButton.textContent = "Cerrar sesión";
        panel.append(messagesLink, personalProfileLink, logoutButton);
        profileMenu.append(profileButton, panel);
        navigation.classList.add("has-profile-menu");
        navigation.replaceChildren(profileMenu);
      });
      return { badgeNodes, profileButtons, ratingBadgeNodes };
    };
    const cachedUser = readCachedSessionUser();
    if (cachedUser) {
      renderAuthenticatedNavigation(cachedUser, true);
      markAuthenticatedNavigationReady();
    } else {
      authNavigationReadyTimer = window.setTimeout(() => {
        restoreAnonymousNavigation();
        markAuthenticatedNavigationReady();
      }, 300);
    }

    fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "No se pudo comprobar la sesión.");
        }
        if (!result.user) {
          clearCachedSessionUser();
          restoreAnonymousNavigation();
          markAuthenticatedNavigationReady();
          return;
        }

        const user = result.user;
        cacheSessionUser(user);
        const { badgeNodes, profileButtons, ratingBadgeNodes } =
          renderAuthenticatedNavigation(user);
        markAuthenticatedNavigationReady();

        let unreadRequestPending = false;
        let unreadRefreshQueued = false;
        const updateUnreadBadges = (value) => {
          const unreadCount = Math.max(0, Math.floor(Number(value) || 0));
          const badgeText = unreadCount > 9 ? "9+" : String(unreadCount);
          badgeNodes.forEach((badge) => {
            badge.textContent = badgeText;
            badge.hidden = unreadCount === 0;
            badge.setAttribute("aria-hidden", String(unreadCount === 0));
            if (unreadCount > 0) {
              badge.setAttribute(
                "aria-label",
                `${unreadCount} mensajes sin leer`,
              );
            } else {
              badge.removeAttribute("aria-label");
            }
          });
          profileButtons.forEach(({ button, displayName: name }) => {
            button.setAttribute(
              "aria-label",
              unreadCount
                ? `Perfil de ${name}, ${unreadCount} mensajes sin leer`
                : `Perfil de ${name}`,
            );
          });
        };
        refreshUnreadNotifications = async () => {
          if (document.visibilityState !== "visible") return;
          if (unreadRequestPending) {
            unreadRefreshQueued = true;
            return;
          }
          unreadRequestPending = true;
          try {
            const response = await fetch("/api/mensajes?resumen=1", {
              credentials: "same-origin",
              cache: "no-store",
            });
            const summary = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(
                summary.error || "No se pudo consultar la mensajería.",
              );
            }
            if (!Number.isFinite(Number(summary.noLeidos))) {
              throw new Error("El resumen de mensajes no tiene un formato válido.");
            }
            updateUnreadBadges(summary.noLeidos);
          } catch (error) {
            console.error("No se pudo actualizar la insignia de mensajes.", error);
          } finally {
            unreadRequestPending = false;
            if (unreadRefreshQueued && document.visibilityState === "visible") {
              unreadRefreshQueued = false;
              refreshUnreadNotifications();
            }
          }
        };
        let pendingRatingRequest = false;
        let pendingRatingRefreshQueued = false;
        refreshPendingRatingBadges = async () => {
          if (document.visibilityState !== "visible") {
            return;
          }
          if (pendingRatingRequest) {
            pendingRatingRefreshQueued = true;
            return;
          }
          pendingRatingRequest = true;
          try {
            const response = await fetch("/api/calificaciones?pendientes=1", {
              credentials: "same-origin",
              cache: "no-store",
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(
                result.error || "No se pudieron consultar las calificaciones.",
              );
            }
            if (!Array.isArray(result.pendientes)) {
              throw new Error(
                "La respuesta de calificaciones no tiene un formato válido.",
              );
            }
            const hasPendingRatings = result.pendientes.length > 0;
            ratingBadgeNodes.forEach(({ badge, link }) => {
              badge.hidden = !hasPendingRatings;
              link.setAttribute(
                "aria-label",
                hasPendingRatings
                  ? "Mi perfil, tienes calificaciones pendientes"
                  : "Mi perfil",
              );
            });
          } catch (error) {
            console.error(
              "No se pudo actualizar el aviso de calificaciones pendientes.",
              error,
            );
          } finally {
            pendingRatingRequest = false;
            if (
              pendingRatingRefreshQueued &&
              document.visibilityState === "visible"
            ) {
              pendingRatingRefreshQueued = false;
              refreshPendingRatingBadges();
            }
          }
        };
        refreshUnreadNotifications();
        refreshPendingRatingBadges();
        const unreadPollTimer = window.setInterval(() => {
          if (document.visibilityState === "visible") {
            refreshUnreadNotifications();
            refreshPendingRatingBadges();
          }
        }, 15000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            refreshUnreadNotifications();
            refreshPendingRatingBadges();
          }
        });
        window.addEventListener("pagehide", () =>
          window.clearInterval(unreadPollTimer),
        );
      })
      .catch((error) => {
        console.error("No se pudo consultar la sesión actual.", error);
      });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest("[data-profile-toggle]");
    if (toggle) {
      const menu = toggle.closest(".profile-menu");
      const panel = menu?.querySelector(".profile-panel");
      if (!menu || !panel) return;
      const opening = panel.hidden;
      document.querySelectorAll(".profile-panel").forEach((otherPanel) => {
        otherPanel.hidden = true;
        otherPanel
          .closest(".profile-menu")
          ?.querySelector("[data-profile-toggle]")
          ?.setAttribute("aria-expanded", "false");
      });
      panel.hidden = !opening;
      toggle.setAttribute("aria-expanded", String(opening));
      return;
    }

    document.querySelectorAll(".profile-menu").forEach((menu) => {
      if (target && menu.contains(target)) return;
      const panel = menu.querySelector(".profile-panel");
      const button = menu.querySelector("[data-profile-toggle]");
      if (panel && !panel.hidden) {
        panel.hidden = true;
        button?.setAttribute("aria-expanded", "false");
      }
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".profile-panel:not([hidden])").forEach((panel) => {
      panel.hidden = true;
      const button = panel
        .closest(".profile-menu")
        ?.querySelector("[data-profile-toggle]");
      button?.setAttribute("aria-expanded", "false");
      button?.focus();
    });
  });

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
      clearCachedSessionUser();
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
  const readBlobAsDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("No se pudo leer la imagen comprimida."));
        }
      });
      reader.addEventListener("error", () =>
        reject(new Error("No se pudo leer la imagen comprimida.")),
      );
      reader.readAsDataURL(blob);
    });
  const compressPhoto = async (file) => {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la fotografía.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const jpeg = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("No se pudo comprimir una fotografía.")),
          "image/jpeg",
          0.7,
        );
      });
      const dataUrl = await readBlobAsDataUrl(jpeg);
      if (dataUrl.length > 1_000_000) {
        throw new Error(
          `La fotografía ${file.name} sigue siendo demasiado pesada después de comprimirla.`,
        );
      }
      return dataUrl;
    } finally {
      bitmap.close();
    }
  };

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
      image.width = 800;
      image.height = 800;
      image.loading = "lazy";
      image.decoding = "async";
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

    if (photos.length > 3) {
      if (notice) notice.textContent = "Selecciona un máximo de 3 fotografías.";
      return;
    }
    if (photos.some((photo) => !photo.type.startsWith("image/"))) {
      if (notice) notice.textContent = "Selecciona solo archivos de imagen.";
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (notice) notice.textContent = "Preparando y guardando publicación…";

    try {
      const formData = new FormData(publishForm);
      const publicationData = {
        category: String(formData.get("category") || ""),
        brand: String(formData.get("brand") || "").trim(),
        age: String(formData.get("age") || ""),
        description: String(formData.get("description") || "").trim(),
        condition: String(formData.get("condition") || ""),
        photos: await Promise.all(photos.map(compressPhoto)),
      };
      const response = await fetch("/api/publicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(publicationData),
      });
      if (response.status === 401) {
        window.location.assign("login.html");
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "No se pudo guardar la publicación.");
      }
      if (!result.publication) {
        throw new Error("La respuesta no incluyó la publicación guardada.");
      }
      const publication = result.publication;
      renderPublishResult(publication);
      if (notice) notice.textContent = "Publicación guardada.";
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
          error instanceof Error
            ? error.message
            : "No se pudo guardar. Inténtalo de nuevo.";
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
    if (photoInput.files.length > 3) {
      if (notice) notice.textContent = "Selecciona un máximo de 3 fotografías.";
      return;
    }
    if (notice) notice.textContent = "";
    [...photoInput.files].slice(0, 3).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const image = document.createElement("img");
      image.alt = `Vista previa: ${file.name}`;
      image.src = URL.createObjectURL(file);
      image.width = 800;
      image.height = 800;
      image.loading = "lazy";
      image.decoding = "async";
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
  let showExamplePublications = false;
  const applyFilters = () => {
    if (!filterList) return;
    const cards = [...filterList.children].filter((item) =>
      item.matches("[data-category], [data-district]") &&
      (!item.hasAttribute("data-example-publication") ||
        showExamplePublications),
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

  const exchangeCategoryFilter = document.querySelector(
    '[data-filter="category"]',
  );
  const exchangeDistrictFilter = document.querySelector('[data-filter="zone"]');
  const appendFilterOptions = (select, values) => {
    if (!select) return;
    const existing = new Set(
      [...select.options].map((option) => normalizeText(option.value)),
    );
    values
      .filter(Boolean)
      .sort((first, second) => first.localeCompare(second, "es"))
      .forEach((value) => {
        const normalized = normalizeText(value);
        if (existing.has(normalized)) return;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
        existing.add(normalized);
      });
  };
  const createExchangeCard = (publication) => {
    const card = document.createElement("article");
    const imageContainer = document.createElement("div");
    const content = document.createElement("div");
    const tags = document.createElement("div");
    const conditionTag = document.createElement("span");
    const categoryTag = document.createElement("span");
    const heading = document.createElement("h3");
    const description = document.createElement("p");
    const meta = document.createElement("p");
    const seller = document.createElement("div");
    const avatar = document.createElement("div");
    const authorName = document.createElement("span");
    const authorRating = document.createElement("span");
    const contactButton = document.createElement("button");
    const category = String(publication.category || "Otros");
    const condition = String(publication.condition || "");
    const district = String(publication.district || "Distrito no indicado");
    const author = String(publication.authorName || "Usuario");
    const authorInitial = String(publication.authorInitial || "").slice(0, 1);
    const details = [publication.brand, publication.age]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" · ");

    card.className = "equipment-card is-visible";
    card.dataset.publicationId = String(publication.id);
    card.dataset.category = category;
    card.dataset.zone = district;
    card.dataset.district = district;
    card.dataset.condition = condition;
    card.dataset.search = normalizeText(
      [
        category,
        publication.brand,
        publication.age,
        publication.description,
        condition,
        district,
        author,
        authorInitial,
      ]
        .filter(Boolean)
        .join(" "),
    );

    imageContainer.className = "equipment-image";
    const photo = Array.isArray(publication.photos)
      ? publication.photos.find(
          (value) =>
            typeof value === "string" &&
            value.startsWith("data:image/jpeg;base64,"),
        )
      : null;
    if (photo) {
      const image = document.createElement("img");
      image.src = photo;
      image.alt = `Fotografía del equipo ${category}`;
      image.width = 800;
      image.height = 800;
      image.loading = "lazy";
      image.decoding = "async";
      imageContainer.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = "Sin fotografía";
      imageContainer.append(placeholder);
    }

    content.className = "equipment-content";
    tags.className = "equipment-tags";
    conditionTag.className =
      condition === "Operativo" ? "tag tag-operational" : "tag tag-repair";
    conditionTag.textContent = condition;
    categoryTag.className = "equipment-category";
    categoryTag.textContent = category;
    tags.append(conditionTag, categoryTag);

    heading.textContent = details ? `${category} · ${details}` : category;
    description.textContent = String(publication.description || "");
    description.className = "equipment-description";
    meta.className = "equipment-meta";
    meta.textContent = `⌖ ${district} · ${formatPublicationDate(publication.createdAt)}`;

    seller.className = "seller-row";
    avatar.className = "seller-avatar";
    avatar.textContent = authorInitial || author.slice(0, 1).toLocaleUpperCase();
    authorName.textContent = authorInitial
      ? `${author} ${authorInitial}.`
      : author;
    authorRating.className = "rating";
    const ratingTotal = Math.max(
      0,
      Math.floor(Number(publication.authorRating?.total) || 0),
    );
    const ratingAverage = Math.min(
      5,
      Math.max(0, Number(publication.authorRating?.promedio) || 0),
    );
    authorRating.textContent = ratingTotal
      ? `★ ${ratingAverage.toFixed(1)} · ${ratingTotal} ${
          ratingTotal === 1 ? "calificación" : "calificaciones"
        }`
      : "Sin calificaciones aún";
    contactButton.type = "button";
    contactButton.className =
      "button button-outline button-full contact-trigger";
    contactButton.dataset.conversationStart = String(publication.id);
    contactButton.textContent = "Contactar";
    seller.append(avatar, authorName, authorRating);
    content.append(tags, heading, description, meta, seller, contactButton);
    card.append(imageContainer, content);
    return card;
  };
  const formatPublicationDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return `Publicado el ${date.toLocaleDateString("es-PE")}`;
  };
  const initializeExchangePublications = async () => {
    if (!filterList) return;
    try {
      const response = await fetch("/api/publicaciones", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`La solicitud respondió ${response.status}.`);
      }
      const result = await response.json();
      if (!Array.isArray(result.publications)) {
        throw new Error("La respuesta de publicaciones no tiene un formato válido.");
      }

      const examples = filterList.querySelectorAll("[data-example-publication]");
      if (result.publications.length === 0) {
        showExamplePublications = true;
        examples.forEach((card) => {
          card.hidden = false;
        });
      } else {
        showExamplePublications = false;
        examples.forEach((card) => card.remove());
        const availablePublications = result.publications.filter((publication) =>
          ["Operativo", "Requiere reparación"].includes(publication.condition),
        );
        appendFilterOptions(
          exchangeCategoryFilter,
          availablePublications.map((publication) => publication.category),
        );
        appendFilterOptions(
          exchangeDistrictFilter,
          availablePublications.map((publication) => publication.district),
        );
        availablePublications.forEach((publication) =>
          filterList.append(createExchangeCard(publication)),
        );
      }
      if (emptyState) {
        emptyState.textContent =
          result.publications.length > 0
            ? "Todavía no hay equipos disponibles en condición operativa o que requieran reparación."
            : emptyState.textContent;
      }
      applyFilters();
    } catch (error) {
      console.error("No se pudieron cargar las publicaciones para intercambio.", error);
      filterList
        .querySelectorAll("[data-example-publication]")
        .forEach((card) => card.remove());
      if (resultCount) resultCount.textContent = "No se pudieron cargar las publicaciones";
      if (emptyState) {
        emptyState.textContent =
          "No se pudieron cargar las publicaciones. Inténtalo de nuevo más tarde.";
        emptyState.hidden = false;
      }
    }
  };
  initializeExchangePublications();

  const reportModal = document.querySelector("[data-report-modal]");
  document.querySelectorAll("[data-report-trigger]").forEach((button) => {
    button.addEventListener("click", () => reportModal?.showModal());
  });
  reportModal?.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    reportModal.close();
    showToast("Reporte registrado en esta demostración visual.");
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-contact], [data-conversation-start]");
    if (!button) return;
    if (button.hasAttribute("data-contact")) {
      showToast(
        `La mensajería con ${button.dataset.contact} es una demostración visual.`,
      );
      return;
    }

    const startConversation = async () => {
      button.disabled = true;
      try {
        const response = await fetch("/api/conversaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            publicacionId: button.dataset.conversationStart,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          window.location.assign("login.html");
          return;
        }
        if (!response.ok || !result.id) {
          throw new Error(result.error || "No se pudo abrir la conversación.");
        }
        window.location.assign(
          `mensajes.html?c=${encodeURIComponent(String(result.id))}`,
        );
      } catch (error) {
        console.error("No se pudo iniciar la conversación.", error);
        showToast(
          error instanceof Error
            ? error.message
            : "No se pudo iniciar la conversación.",
        );
        button.disabled = false;
      }
    };
    startConversation();
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

  const messageList = document.querySelector("[data-message-list]");
  const conversationList = document.querySelector("[data-conversation-list]");
  const conversationStatus = document.querySelector("[data-conversations-status]");
  const messageStatus = document.querySelector("[data-message-status]");
  const chatTitle = document.querySelector("[data-chat-title]");
  const chatCounterpart = document.querySelector("[data-chat-counterpart]");
  const chatPlaceholder = document.querySelector("[data-chat-placeholder]");
  const messageForm = document.querySelector("[data-message-form]");
  const messageInput = messageForm?.querySelector("textarea");
  const messageSubmit = messageForm?.querySelector("[data-message-submit]");
  const meetingToggle = document.querySelector("[data-meeting-toggle]");
  const meetingPicker = document.querySelector("[data-meeting-picker]");
  const meetingPointList = document.querySelector("[data-meeting-point-list]");
  const meetingStatus = document.querySelector("[data-meeting-status]");
  let activeConversationId = null;
  let currentUserId = null;
  let conversationRecords = [];
  let messagePollTimer;
  let meetingPointsPromise;
  let isLoadingMessages = false;
  let isLoadingConversations = false;
  let isSendingMessage = false;

  const updateConversationControls = (enabled) => {
    if (messageInput) messageInput.disabled = !enabled;
    if (messageSubmit) messageSubmit.disabled = !enabled;
    if (meetingToggle) meetingToggle.disabled = !enabled;
  };
  const handleSessionRequired = (response) => {
    if (response.status !== 401) return false;
    window.location.assign("login.html");
    return true;
  };
  const readApiResponse = async (response) => {
    if (handleSessionRequired(response)) {
      throw new Error("Redirigiendo al inicio de sesión.");
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "No se pudo completar la solicitud.");
    }
    return result;
  };
  const formatMessageTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const renderConversationList = () => {
    if (!conversationList) return;
    conversationList.replaceChildren();
    conversationRecords.forEach((conversation) => {
      const button = document.createElement("button");
      const top = document.createElement("span");
      const titleWrap = document.createElement("span");
      const title = document.createElement("span");
      const unreadBadge = document.createElement("span");
      const date = document.createElement("span");
      const person = document.createElement("span");
      const preview = document.createElement("span");
      const titleText = [conversation.category, conversation.brand]
        .filter(Boolean)
        .join(" · ");

      button.type = "button";
      button.className = "conversation-item";
      button.dataset.conversationId = String(conversation.id);
      if (String(conversation.id) === activeConversationId) {
        button.setAttribute("aria-current", "true");
      }
      top.className = "conversation-item-top";
      titleWrap.className = "conversation-item-title-wrap";
      title.className = "conversation-item-title";
      title.textContent = titleText || "Equipo publicado";
      unreadBadge.className = "unread-badge conversation-unread-badge";
      unreadBadge.hidden = true;
      unreadBadge.setAttribute("aria-hidden", "true");
      const unreadCount = Math.max(
        0,
        Math.floor(Number(conversation.unreadCount) || 0),
      );
      if (unreadCount > 0) {
        unreadBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
        unreadBadge.hidden = false;
        unreadBadge.setAttribute(
          "aria-label",
          `${unreadCount} mensajes sin leer`,
        );
      }
      titleWrap.append(title, unreadBadge);
      date.className = "conversation-item-date";
      date.textContent = formatMessageTime(
        conversation.lastMessageAt || conversation.createdAt,
      );
      top.append(titleWrap, date);
      person.className = "conversation-item-person";
      person.textContent = conversation.otherInitial
        ? `${conversation.otherName} ${conversation.otherInitial}.`
        : String(conversation.otherName || "Usuario");
      preview.className = "conversation-item-preview";
      preview.textContent = String(
        conversation.lastMessage || "Inicia la conversación",
      );
      button.append(top, person, preview);
      conversationList.append(button);
    });
  };
  const renderMessages = (messages, forceScroll = false) => {
    if (!messageList) return;
    const shouldScroll =
      forceScroll ||
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight <
        60;
    messageList.replaceChildren();
    if (!messages.length) {
      if (chatPlaceholder) {
        chatPlaceholder.textContent =
          "Aún no hay mensajes. Saluda o sugiere un punto de encuentro.";
        messageList.append(chatPlaceholder);
      }
      return;
    }
    messages.forEach((message) => {
      const bubble = document.createElement("article");
      const author = document.createElement("span");
      const text = document.createElement("p");
      const time = document.createElement("time");
      const own = String(message.authorId) === currentUserId;

      bubble.className = "message-bubble";
      bubble.dataset.own = String(own);
      author.className = "message-author";
      author.textContent = own
        ? "Tú"
        : message.authorInitial
          ? `${message.authorName} ${message.authorInitial}.`
          : String(message.authorName || "Usuario");
      text.className = "message-text";
      text.textContent = String(message.text || "");
      time.className = "message-time";
      time.dateTime = String(message.createdAt || "");
      time.textContent = formatMessageTime(message.createdAt);
      bubble.append(author, text, time);
      messageList.append(bubble);
    });
    if (shouldScroll) messageList.scrollTop = messageList.scrollHeight;
  };
  const loadMessages = async (forceScroll = false) => {
    if (!activeConversationId || isLoadingMessages) return;
    isLoadingMessages = true;
    try {
      const response = await fetch(
        `/api/mensajes?conversacion=${encodeURIComponent(activeConversationId)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const result = await readApiResponse(response);
      if (!Array.isArray(result.messages)) {
        throw new Error("La respuesta de mensajes no tiene un formato válido.");
      }
      renderMessages(result.messages, forceScroll);
      const selectedConversation = conversationRecords.find(
        (conversation) => String(conversation.id) === activeConversationId,
      );
      if (selectedConversation) {
        selectedConversation.unreadCount = 0;
        renderConversationList();
      }
      refreshUnreadNotifications();
      if (messageStatus) messageStatus.textContent = "";
    } catch (error) {
      if (messageStatus && !window.location.href.includes("login.html")) {
        messageStatus.textContent =
          error instanceof Error ? error.message : "No se pudieron cargar los mensajes.";
      }
      console.error("No se pudieron cargar los mensajes.", error);
    } finally {
      isLoadingMessages = false;
    }
  };
  const selectConversation = async (conversationId) => {
    const selected = conversationRecords.find(
      (conversation) => String(conversation.id) === String(conversationId),
    );
    if (!selected) return;
    activeConversationId = String(selected.id);
    renderConversationList();
    if (chatCounterpart) {
      chatCounterpart.textContent = selected.otherInitial
        ? `CONVERSACIÓN CON ${selected.otherName} ${selected.otherInitial}.`
        : `CONVERSACIÓN CON ${String(selected.otherName || "USUARIO")}`.toLocaleUpperCase();
    }
    if (chatTitle) {
      chatTitle.textContent =
        [selected.category, selected.brand].filter(Boolean).join(" · ") ||
        "Conversación";
    }
    if (chatPlaceholder) {
      chatPlaceholder.textContent = "Cargando mensajes…";
      messageList?.replaceChildren(chatPlaceholder);
    }
    updateConversationControls(true);
    const url = new URL(window.location.href);
    url.searchParams.set("c", activeConversationId);
    window.history.replaceState({}, "", url);
    await loadMessages(true);
  };
  const refreshConversationList = async (selectInitial = false) => {
    if (!conversationList || isLoadingConversations) return;
    isLoadingConversations = true;
    try {
      const response = await fetch("/api/conversaciones", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await readApiResponse(response);
      if (!Array.isArray(result.conversations)) {
        throw new Error("La respuesta de conversaciones no tiene un formato válido.");
      }
      conversationRecords = result.conversations;
      renderConversationList();
      if (conversationStatus) {
        conversationStatus.textContent = conversationRecords.length
          ? ""
          : "Aún no tienes conversaciones. Contacta una publicación para comenzar.";
      }

      if (!conversationRecords.length) {
        activeConversationId = null;
        if (chatTitle) chatTitle.textContent = "Tu espacio para coordinar";
        if (chatCounterpart) chatCounterpart.textContent = "ELIGE UNA CONVERSACIÓN";
        if (chatPlaceholder) {
          chatPlaceholder.textContent =
            "Cuando contactes una publicación, podrás conversar aquí.";
          messageList?.replaceChildren(chatPlaceholder);
        }
        updateConversationControls(false);
        return;
      }

      if (
        selectInitial ||
        !conversationRecords.some(
          (conversation) => String(conversation.id) === activeConversationId,
        )
      ) {
        const requestedConversation =
          new URLSearchParams(window.location.search).get("c");
        const initialConversation =
          conversationRecords.find(
            (conversation) => String(conversation.id) === requestedConversation,
          ) || conversationRecords[0];
        await selectConversation(initialConversation.id);
      } else {
        renderConversationList();
      }
      if (conversationStatus) conversationStatus.textContent = "";
    } catch (error) {
      if (conversationStatus) {
        conversationStatus.textContent =
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las conversaciones.";
      }
      console.error("No se pudieron cargar las conversaciones.", error);
    } finally {
      isLoadingConversations = false;
    }
  };
  conversationList?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-conversation-id]");
    if (!button) return;
    selectConversation(button.dataset.conversationId);
  });
  messageInput?.addEventListener("keydown", (event) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.isComposing ||
      !activeConversationId ||
      isSendingMessage
    ) {
      return;
    }
    event.preventDefault();
    messageForm?.requestSubmit();
  });
  messageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = messageInput?.value.trim() || "";
    if (
      !activeConversationId ||
      isSendingMessage ||
      !text ||
      text.length > 1000
    ) {
      return;
    }
    isSendingMessage = true;
    if (messageSubmit) messageSubmit.disabled = true;
    if (messageInput) messageInput.disabled = true;
    if (messageStatus) messageStatus.textContent = "Enviando mensaje…";
    try {
      const response = await fetch("/api/mensajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          conversacionId: activeConversationId,
          texto: text,
        }),
      });
      await readApiResponse(response);
      if (messageInput) messageInput.value = "";
      await loadMessages(true);
      await refreshConversationList(false);
      if (messageStatus) messageStatus.textContent = "Mensaje enviado.";
    } catch (error) {
      if (messageStatus && !window.location.href.includes("login.html")) {
        messageStatus.textContent =
          error instanceof Error ? error.message : "No se pudo enviar el mensaje.";
      }
      console.error("No se pudo enviar el mensaje.", error);
    } finally {
      isSendingMessage = false;
      if (messageInput) messageInput.disabled = !activeConversationId;
      if (messageSubmit) {
        messageSubmit.disabled = !activeConversationId;
      }
    }
  });
  const loadPiuraMeetingPoints = () => {
    if (meetingPointsPromise) return meetingPointsPromise;
    meetingPointsPromise = fetch("assets/data/raee-points.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`El catálogo de puntos respondió ${response.status}.`);
        }
        return response.json();
      })
      .then((points) => {
        if (!Array.isArray(points)) {
          throw new Error("El catálogo de puntos no tiene un formato válido.");
        }
        return points.filter(
          (point) =>
            normalizeText(String(point.department || "")) === "piura" &&
            point.name &&
            point.address,
        );
      });
    return meetingPointsPromise;
  };
  const sendMeetingSuggestion = async (point) => {
    const text = `Punto de encuentro sugerido: ${point.name} — ${point.address}`;
    if (meetingStatus) meetingStatus.textContent = "Enviando sugerencia…";
    try {
      const response = await fetch("/api/mensajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          conversacionId: activeConversationId,
          texto: text,
        }),
      });
      await readApiResponse(response);
      if (meetingPicker) meetingPicker.hidden = true;
      await loadMessages(true);
      await refreshConversationList(false);
      if (meetingStatus) meetingStatus.textContent = "";
    } catch (error) {
      if (meetingStatus) {
        meetingStatus.textContent =
          error instanceof Error
            ? error.message
            : "No se pudo enviar el punto de encuentro.";
      }
      console.error("No se pudo enviar el punto de encuentro.", error);
    }
  };
  meetingToggle?.addEventListener("click", async () => {
    if (!meetingPicker) return;
    meetingPicker.hidden = !meetingPicker.hidden;
    if (meetingPicker.hidden || !meetingPointList) return;
    meetingPointList.replaceChildren();
    if (meetingStatus) meetingStatus.textContent = "Cargando puntos de acopio…";
    try {
      const points = await loadPiuraMeetingPoints();
      if (!points.length) {
        if (meetingStatus) {
          meetingStatus.textContent =
            "No encontramos puntos de acopio disponibles para Piura.";
        }
        return;
      }
      if (meetingStatus) meetingStatus.textContent = "";
      points.forEach((point) => {
        const button = document.createElement("button");
        const name = document.createElement("strong");
        const address = document.createElement("span");
        button.type = "button";
        button.className = "meeting-point-option";
        name.textContent = String(point.name);
        address.textContent = String(point.address);
        button.append(name, address);
        button.addEventListener("click", () => sendMeetingSuggestion(point));
        meetingPointList.append(button);
      });
    } catch (error) {
      if (meetingStatus) {
        meetingStatus.textContent =
          error instanceof Error ? error.message : "No se pudieron cargar los puntos.";
      }
      console.error("No se pudieron cargar los puntos de encuentro.", error);
    }
  });
  document
    .querySelector("[data-meeting-close]")
    ?.addEventListener("click", () => {
      if (meetingPicker) meetingPicker.hidden = true;
    });

  if (messageList && conversationList) {
    const initializeMessages = async () => {
      try {
        const response = await fetch("/api/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const result = await readApiResponse(response);
        if (!result.user) {
          window.location.assign("login.html");
          return;
        }
        currentUserId = String(result.user.id);
        await refreshConversationList(true);
        messagePollTimer = window.setInterval(() => {
          if (document.visibilityState !== "visible") return;
          refreshConversationList(false);
          loadMessages(false);
        }, 5000);
      } catch (error) {
        if (!window.location.href.includes("login.html")) {
          if (conversationStatus) {
            conversationStatus.textContent =
              error instanceof Error
                ? error.message
                : "No se pudo iniciar el chat.";
          }
          console.error("No se pudo iniciar el chat.", error);
        }
      }
    };
    initializeMessages();
    window.addEventListener("pagehide", () => {
      if (messagePollTimer) window.clearInterval(messagePollTimer);
    });
  }

  document.querySelectorAll("[data-accordion] details").forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (!detail.open) return;
      document.querySelectorAll("[data-accordion] details").forEach((other) => {
        if (other !== detail) other.open = false;
      });
    });
  });
});
