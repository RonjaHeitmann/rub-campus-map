document.addEventListener("DOMContentLoaded", async () => {
    const mapContainer = document.getElementById("map-container");
    const infoText = document.getElementById("info-text");
    const searchInput = document.getElementById("search-input");
    const searchResults = document.getElementById("search-results");
    const currentFloorBadge = document.getElementById("current-floor-badge");
    const desktopFloorBadge = document.getElementById("desktop-floor-badge");
    const btnFloorUp = document.getElementById("btn-floor-up");
    const btnFloorDown = document.getElementById("btn-floor-down");
    const appWrapper = document.querySelector(".app-wrapper");
    const buildingName = document.getElementById("building-name");
    const buildingTransition = document.getElementById("building-transition");
    const buildingTransitionLabel = document.getElementById("building-transition-label");
    const buildingTransitionButton = document.getElementById("building-transition-button");
    const buildingTransitionArrow = document.getElementById("building-transition-arrow");
    const mapLegend = document.getElementById("map-legend");
    const legendToggle = document.getElementById("legend-toggle");
    const legendItems = document.getElementById("legend-items");

    // DOM Element-Verknüpfungen
    const destInput = document.getElementById("destination-input");
    const startInput = document.getElementById("start-input");
    const clearDestButton = document.getElementById("clear-destination");
    const clearStartButton = document.getElementById("clear-start");
    const labelStartFloor = document.getElementById("label-start-floor");
    const labelDestFloor = document.getElementById("label-dest-floor");
    const transportOptions = document.querySelectorAll(".transport-option");

    legendToggle?.addEventListener("click", () => {
        const isExpanded = legendToggle.getAttribute("aria-expanded") === "true";
        legendToggle.setAttribute("aria-expanded", String(!isExpanded));
        legendToggle.setAttribute("aria-label", isExpanded ? "Legende anzeigen" : "Legende ausblenden");
        mapLegend?.classList.toggle("is-collapsed", isExpanded);
        if (legendItems) legendItems.hidden = isExpanded;
    });

    // Kartenansichten für die Gebäude ID und IC laden.
    try {
        const v = new Date().getTime();
        const [res0, res1, resIC] = await Promise.all([
            fetch(`ID04.svg?v=${v}`),
            fetch(`ID2.svg?v=${v}`),
            fetch(`IC04.svg?v=${v}`)
        ]);

        if (!res0.ok || !res1.ok || !resIC.ok) {
            throw new Error("Eine der SVG-Dateien konnte nicht geladen werden.");
        }

        const [text0, text1, textIC] = await Promise.all([res0.text(), res1.text(), resIC.text()]);

        mapContainer.innerHTML = text0 + text1 + textIC;

        const svgs = mapContainer.querySelectorAll("svg");
        if (svgs.length < 3) {
            throw new Error("Nicht alle Gebäudepläne konnten geladen werden.");
        }

        svgs[0].id = "floor-0";
        svgs[0].classList.add("floor-group", "active-floor");

        svgs[1].id = "floor-1";
        svgs[1].classList.add("floor-group", "hidden-floor");

        svgs[2].id = "floor-IC04";
        svgs[2].classList.add("floor-group", "hidden-floor");

    } catch (err) {
        console.error("Fehler beim Laden der SVG-Dateien:", err);
        return;
    }

    let currentFloor = 0;
    const maxFloors = 1;
    let currentBuilding = "ID";
    let selectedBuildingExit = null;
    const buildingExits = { ID: null, IC: null };
    const floorNames = { 0: "Ebene 04", 1: "Ebene 2" };
    let selectedRoomElement = null;
    let startRoom = null;
    let destinationRoom = null;
    let selectedTransportMode = 'staircase';

    const Raum = [];
    const Flur = [];
    const Treppenhaus = [];
    const Aufzug = [];
    let allGridCells = [];

    // FEHLER 2 BEHOBEN: mapContainer statt svg
    const allFloorGroups = mapContainer.querySelectorAll(".floor-group");
    allFloorGroups.forEach((floorSvg) => {
        const floorId = floorSvg.id;
        const elements = floorSvg.querySelectorAll("rect, path, polygon, g");

        elements.forEach((element, elemIndex) => {
            if (element.tagName.toLowerCase() === "g") {
                if (element.getAttribute("inkscape:groupmode") === "layer") return;
                element.setAttribute("data-floor", floorId);
            }
            const rawLabel = element.getAttribute("inkscape:label") || element.id || "";
            if (!rawLabel || rawLabel.startsWith("rect") || rawLabel.startsWith("path")) return;

            const label = rawLabel;
            const cleanName = label.replace(/^(?:ID|IC)\d+_/, "");

            if (label.toLowerCase() === "ic_exit") {
                const building = floorId === "floor-IC04" ? "IC" : "ID";
                element.classList.add("building-exit");
                element.setAttribute("tabindex", "0");
                element.setAttribute("role", "button");
                element.setAttribute(
                    "aria-label",
                    building === "ID"
                        ? "Übergang zum Gebäude IC. Pfeil nach links."
                        : "Übergang zum Gebäude ID. Pfeil nach rechts."
                );
                element.setAttribute(
                    "title",
                    building === "ID"
                        ? "Klicken und ← drücken, um zu Gebäude IC zu wechseln."
                        : "Klicken und → drücken, um zu Gebäude ID zu wechseln."
                );
                element.addEventListener("focus", () => {
                    selectedBuildingExit = element;
                });
                element.addEventListener("click", event => {
                    event.stopPropagation();
                    switchBuilding(building === "ID" ? "IC" : "ID");
                });
                buildingExits[building] = element;
                return;
            }

            const isFlur = label.toLowerCase().includes("flur") || label.toLowerCase().includes("hallway");
            const isTreppenhaus = label.toLowerCase().includes("treppe") || label.toLowerCase().includes("stair");
            const isAufzug = label.toLowerCase().includes("aufzug") || label.toLowerCase().includes("lift") || label.toLowerCase().includes("elevator");

            const roomObj = {
                id: cleanName,
                rawId: label,
                title: cleanName,
                element: element,
                isFlur,
                isTreppenhaus,
                isAufzug,
                floorGroup: floorId,
                uniqueId: `${floorId}-${cleanName}-${elemIndex}`
            };

            if (!Raum.some(r => r.element === element) && !Flur.some(f => f.element === element)) {
                if (isFlur) {
                    Flur.push(roomObj);
                } else if (isTreppenhaus) {
                    Treppenhaus.push(roomObj);
                    Raum.push(roomObj);
                } else if (isAufzug) {
                    Aufzug.push(roomObj);
                    Raum.push(roomObj);
                } else {
                    Raum.push(roomObj);
                }

                element.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onRoomClick(element);
                });
            }
        });
    });

    // --- RAUMBESCHRIFTUNGEN GENERIEREN ---
    function createRoomLabel(elem, textColor = "black", roomId = "") {
        if (!elem || typeof elem.getBBox !== "function") return;

        try {
            const bbox = getBBoxInParentCoordinates(elem);
            if (bbox.width <= 1 || bbox.height <= 1) return;

            const centerX = bbox.x + (bbox.width / 2);
            const centerY = bbox.y + (bbox.height / 2);

            const idToFormat = roomId || elem.id || "";
            const raumIdFormatted = idToFormat
                .replace(/^ID\d+_/, "")
                .replace(/^Raum_/, "");

            const existingLabel = [...elem.ownerSVGElement.querySelectorAll(".room-label-text")]
                .find(label => label.getAttribute("data-room-element-id") === elem.id);
            if (existingLabel) {
                existingLabel.textContent = raumIdFormatted;
                existingLabel.style.setProperty("fill", textColor, "important");
                return;
            }

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", centerX);
            text.setAttribute("y", centerY);
            text.setAttribute("fill", textColor);
            text.setAttribute("font-size", "1");
            text.setAttribute("font-weight", "bold");
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("dominant-baseline", "central");
            text.setAttribute("class", "room-label-text");
            text.setAttribute("data-room-element-id", elem.id);
            text.textContent = raumIdFormatted;

            text.style.cursor = "pointer";
            text.style.pointerEvents = "auto";

            elem.parentNode.appendChild(text);
            const textWidthAtUnitSize = text.getComputedTextLength();
            if (textWidthAtUnitSize <= 0) {
                text.remove();
                return;
            }

            const inset = Math.min(bbox.width, bbox.height) * 0.08;
            const maxWidth = Math.max(0, bbox.width - inset * 2);
            const maxHeight = Math.max(0, bbox.height - inset * 2);
            if (maxWidth <= 0 || maxHeight <= 0) {
                text.remove();
                return;
            }
            const viewBoxWidth = elem.ownerSVGElement?.viewBox?.baseVal?.width || 200;
            const maxFontSize = viewBoxWidth > 400 ? 14 : 3.5;
            const fontSize = Math.min(
                maxFontSize,
                maxHeight * 0.8,
                maxWidth / textWidthAtUnitSize * 0.75
            );
            if (fontSize <= 0) {
                text.remove();
                return;
            }
            text.setAttribute("font-size", fontSize);
            const textBox = text.getBBox();
            const scale = Math.min(
                1,
                textBox.width > 0 ? maxWidth / textBox.width : 1,
                textBox.height > 0 ? maxHeight / textBox.height : 1
            );
            if (scale < 1) {
                text.setAttribute("font-size", fontSize * scale * 0.9);
            }
            const fittedBox = text.getBBox();
            text.setAttribute(
                "x",
                Number(text.getAttribute("x")) + centerX - (fittedBox.x + fittedBox.width / 2)
            );
            text.setAttribute(
                "y",
                Number(text.getAttribute("y")) + centerY - (fittedBox.y + fittedBox.height / 2)
            );

            text.addEventListener("click", (e) => {
                e.stopPropagation();
                onRoomClick(elem);
            });
        } catch (e) {
            console.warn(`Label-Berechnung für Element fehlgeschlagen:`, e);
        }
    }

    function renderRoomLabels() {
        const visibilityStates = [];
        allFloorGroups.forEach(floor => {
            const wasHidden = floor.classList.contains("hidden-floor");
            visibilityStates.push({
                group: floor,
                wasHidden,
                display: floor.style.getPropertyValue("display"),
                displayPriority: floor.style.getPropertyPriority("display"),
                visibility: floor.style.getPropertyValue("visibility"),
                visibilityPriority: floor.style.getPropertyPriority("visibility")
            });
            if (wasHidden) {
                floor.style.setProperty("visibility", "hidden", "important");
                floor.style.setProperty("display", "block", "important");
            }
        });

        try {
            mapContainer.querySelectorAll(".room-label-text").forEach(el => el.remove());

            Raum.forEach(room => {
                const titleLower = room.title.toLowerCase();

                const isExcluded =
                    room.isFlur ||
                    room.isTreppenhaus ||
                    room.isAufzug ||
                    titleLower.includes("toilette") ||
                    titleLower.includes("wc") ||
                    titleLower.includes("flur") ||
                    titleLower.includes("treppe") ||
                    titleLower.includes("aufzug");

                if (!isExcluded) {
                    createRoomLabel(room.element, "black", room.id);
                }
            });
        } finally {
            visibilityStates.forEach(state => {
                if (state.display) {
                    state.group.style.setProperty("display", state.display, state.displayPriority);
                } else {
                    state.group.style.removeProperty("display");
                }
                if (state.visibility) {
                    state.group.style.setProperty("visibility", state.visibility, state.visibilityPriority);
                } else {
                    state.group.style.removeProperty("visibility");
                }
            });
        }
    }

    function switchFloor(floorIndex) {
        const buildingMaxFloor = currentBuilding === "IC" ? 0 : maxFloors;
        if (floorIndex < 0 || floorIndex > buildingMaxFloor) return;
        currentFloor = floorIndex;

        const activeFloorId = currentBuilding === "IC" ? "floor-IC04" : `floor-${currentFloor}`;
        allFloorGroups.forEach(fg => {
            if (fg.id === activeFloorId) {
                fg.classList.remove("hidden-floor");
                fg.classList.add("active-floor");
            } else {
                fg.classList.remove("active-floor");
                fg.classList.add("hidden-floor");
            }
        });

        if (currentFloorBadge) {
            currentFloorBadge.textContent = getFloorLabel(currentBuilding, currentFloor);
        }
        if (desktopFloorBadge) {
            desktopFloorBadge.textContent = getFloorLabel(currentBuilding, currentFloor);
        }
        if (buildingName) buildingName.textContent = currentBuilding;
        if (btnFloorUp) btnFloorUp.disabled = currentBuilding === "IC" || currentFloor >= maxFloors;
        if (btnFloorDown) btnFloorDown.disabled = currentFloor <= 0;
        if (currentFloor !== 0) selectedBuildingExit = null;
        updateBuildingTransitionControl();
    }

    function getBuildingForFloor(floorGroup) {
        return floorGroup === "floor-IC04" ? "IC" : "ID";
    }

    function getFloorIndex(floorGroup) {
        return floorGroup === "floor-1" ? 1 : 0;
    }

    function getFloorLabelForGroup(floorGroup) {
        return getFloorLabel(getBuildingForFloor(floorGroup), getFloorIndex(floorGroup));
    }

    function getFloorLabel(building, floorIndex) {
        return `${building} · ${floorNames[floorIndex] || `Ebene ${floorIndex}`}`;
    }

    function switchBuilding(building) {
        if (building !== "ID" && building !== "IC") return;
        selectedBuildingExit = null;
        currentBuilding = building;
        switchFloor(0);
        selectedBuildingExit = buildingExits[building];
        selectedBuildingExit?.focus({ preventScroll: true });
    }

    function showRoomFloor(roomObj) {
        const building = getBuildingForFloor(roomObj.floorGroup);
        const floorIndex = getFloorIndex(roomObj.floorGroup);
        if (currentBuilding !== building) {
            currentBuilding = building;
            selectedBuildingExit = null;
        }
        switchFloor(floorIndex);
    }

    function updateBuildingTransitionControl() {
        const exit = buildingExits[currentBuilding];
        const activeFloorId = currentBuilding === "IC" ? "floor-IC04" : `floor-${currentFloor}`;
        const anchor = currentFloor === 0 ? exit : currentFloorBadge;
        if (
            !buildingTransition ||
            !appWrapper ||
            (currentBuilding === "ID" && currentFloor === 1) ||
            (currentBuilding === "IC" && currentFloor !== 0) ||
            !anchor
        ) {
            if (buildingTransition) buildingTransition.hidden = true;
            return;
        }

        const targetBuilding = currentBuilding === "ID" ? "IC" : "ID";
        const arrow = currentBuilding === "ID" ? "◀" : "▶";
        buildingTransition.classList.toggle("is-reversed", currentBuilding === "IC");
        if (buildingTransitionLabel) {
            buildingTransitionLabel.textContent = getFloorLabel(targetBuilding, 0);
        }
        if (buildingTransitionArrow) buildingTransitionArrow.textContent = arrow;
        if (buildingTransitionButton) {
            buildingTransitionButton.setAttribute("aria-label", `Zu Gebäude ${targetBuilding} wechseln`);
            buildingTransitionButton.title = `Zu Gebäude ${targetBuilding} wechseln`;
        }

        buildingTransition.hidden = false;
        buildingTransition.style.visibility = "hidden";
        const wrapperRect = appWrapper.getBoundingClientRect();
        const exitRect = anchor.getBoundingClientRect();
        const controlWidth = buildingTransition.offsetWidth;
        const controlHeight = buildingTransition.offsetHeight;
        const gap = 8;
        const requestedLeft = currentBuilding === "ID"
            ? exitRect.left - wrapperRect.left - controlWidth - gap
            : exitRect.right - wrapperRect.left + gap;
        const alternateLeft = currentBuilding === "ID"
            ? exitRect.right - wrapperRect.left + gap
            : exitRect.left - wrapperRect.left - controlWidth - gap;
        const preferredLeftFits =
            requestedLeft >= gap &&
            requestedLeft + controlWidth <= wrapperRect.width - gap;
        const requestedPlacement = preferredLeftFits ? requestedLeft : alternateLeft;
        let left = Math.max(gap, Math.min(requestedPlacement, wrapperRect.width - controlWidth - gap));

        const maxTop = wrapperRect.height - controlHeight - gap;
        const centerTop = exitRect.top - wrapperRect.top + exitRect.height / 2 - controlHeight / 2;
        const roomBounds = [...Raum]
            .filter(room =>
                room.floorGroup === activeFloorId &&
                !room.isFlur &&
                !room.isTreppenhaus &&
                !room.isAufzug
            )
            .map(room => room.element.getBoundingClientRect());
        const checkedTops = new Set();
        let top = Math.max(gap, Math.min(centerTop, maxTop));
        let bestOverlapCount = Number.POSITIVE_INFINITY;
        for (let offset = 0; offset <= wrapperRect.height; offset += 8) {
            const candidates = offset === 0
                ? [centerTop]
                : [centerTop - offset, centerTop + offset];
            for (const candidate of candidates) {
                const candidateTop = Math.max(gap, Math.min(candidate, maxTop));
                if (checkedTops.has(candidateTop)) continue;
                checkedTops.add(candidateTop);

                const overlapCount = roomBounds.filter(room =>
                    left < room.right - wrapperRect.left &&
                    left + controlWidth > room.left - wrapperRect.left &&
                    candidateTop < room.bottom - wrapperRect.top &&
                    candidateTop + controlHeight > room.top - wrapperRect.top
                ).length;
                if (overlapCount < bestOverlapCount) {
                    bestOverlapCount = overlapCount;
                    top = candidateTop;
                }
                if (overlapCount === 0) break;
            }
            if (bestOverlapCount === 0) break;
        }
        buildingTransition.style.left = `${left}px`;
        buildingTransition.style.top = `${top}px`;
        buildingTransition.style.visibility = "";
    }

    buildingTransitionButton?.addEventListener("click", () => {
        switchBuilding(currentBuilding === "ID" ? "IC" : "ID");
    });
    window.addEventListener("resize", updateBuildingTransitionControl);

    document.addEventListener("keydown", (e) => {
        if (document.activeElement === searchInput || document.activeElement === startInput || document.activeElement === destInput) return;
        if (
            currentBuilding === "ID" &&
            e.key === "ArrowLeft" &&
            (selectedBuildingExit === buildingExits.ID || currentFloor === 1)
        ) {
            e.preventDefault();
            switchBuilding("IC");
            return;
        }
        if (selectedBuildingExit === buildingExits.IC && currentBuilding === "IC" && e.key === "ArrowRight") {
            e.preventDefault();
            switchBuilding("ID");
            return;
        }
        if (e.key === "ArrowUp" && currentBuilding === "ID" && currentFloor < maxFloors) {
            e.preventDefault();
            switchFloor(currentFloor + 1);
        }
        if (e.key === "ArrowDown" && currentFloor > 0) {
            e.preventDefault();
            switchFloor(currentFloor - 1);
        }
    });

    btnFloorUp?.addEventListener("click", () => {
        if (currentBuilding === "ID" && currentFloor < maxFloors) switchFloor(currentFloor + 1);
    });
    btnFloorDown?.addEventListener("click", () => { if (currentFloor > 0) switchFloor(currentFloor - 1); });

    function getBBoxInParentCoordinates(element) {
        const bbox = element.getBBox();
        const parent = element.parentElement;
        const elementMatrix = element.getCTM();
        const parentMatrix = parent?.getCTM();
        if (!parent || !elementMatrix || !parentMatrix) return bbox;

        const matrix = parentMatrix.inverse().multiply(elementMatrix);
        const corners = [
            [bbox.x, bbox.y],
            [bbox.x + bbox.width, bbox.y],
            [bbox.x, bbox.y + bbox.height],
            [bbox.x + bbox.width, bbox.y + bbox.height]
        ].map(([x, y]) => ({
            x: matrix.a * x + matrix.c * y + matrix.e,
            y: matrix.b * x + matrix.d * y + matrix.f
        }));
        const xs = corners.map(point => point.x);
        const ys = corners.map(point => point.y);

        return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
        };
    }

    // Unsichtbare Kacheln im Hintergrund aufbauen
    function gridifyAndColorHallways() {
        // FEHLER 2 BEHOBEN: mapContainer statt svg
        mapContainer.querySelectorAll(".grid-cell").forEach(cell => cell.remove());
        allGridCells = [];
        let cellCounter = 0;

        Flur.forEach(flurItem => {
            const elem = flurItem.element;
            if (typeof elem.getBBox !== "function") return;

            try {
                const bbox = getBBoxInParentCoordinates(elem);
                if (bbox.width <= 0 || bbox.height <= 0) return;

                // FEHLER 5 BEHOBEN: Kachelgröße an SVG-Breite anpassen
                const vbWidth = elem.ownerSVGElement?.viewBox?.baseVal?.width || 200;
                const targetSize = vbWidth > 400 ? 6.0 : 1.5;

                const cols = Math.max(1, Math.round(bbox.width / targetSize));
                const rows = Math.max(1, Math.round(bbox.height / targetSize));

                const cellWidth = bbox.width / cols;
                const cellHeight = bbox.height / rows;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const x = bbox.x + c * cellWidth;
                        const y = bbox.y + r * cellHeight;

                        const cellObj = {
                            id: `cell-${cellCounter++}`,
                            x: x,
                            y: y,
                            w: cellWidth,
                            h: cellHeight,
                            floorGroup: flurItem.floorGroup,
                            parentElement: elem.parentElement
                        };
                        allGridCells.push(cellObj);
                    }
                }
            } catch (e) {
                console.warn("Fehler beim Rasterisieren eines Flurs:", e);
            }
        });
    }

    function highlightTilePath(tilePath) {
        if (!tilePath || tilePath.length === 0) return;

        const points = tilePath.map(t => ({
            x: t.x + t.w / 2,
            y: t.y + t.h / 2
        }));

        const pathElem = document.createElementNS("http://www.w3.org/2000/svg", "path");

        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }

        const pathParent = tilePath[0].parentElement;
        const floorSvg = pathParent.ownerSVGElement || pathParent;
        const vbWidth = floorSvg.viewBox?.baseVal?.width || 200;
        const strokeWidth = vbWidth > 400 ? "5.5" : "1.5";

        pathElem.setAttribute("d", d);
        pathElem.setAttribute("class", "grid-cell path-line");

        pathElem.style.setProperty("stroke", "#1F2E66", "important");
        pathElem.style.setProperty("stroke-width", strokeWidth, "important");
        pathElem.style.setProperty("stroke-linecap", "round", "important");
        pathElem.style.setProperty("stroke-linejoin", "round", "important");
        pathElem.style.setProperty("fill", "none", "important");

        tilePath[0].parentElement.appendChild(pathElem);
    }

    function clearPath() {
        // FEHLER 2 BEHOBEN: mapContainer statt svg
        mapContainer.querySelectorAll(".grid-cell").forEach(el => el.remove());
    }

    function isCellTouchingRoom(cell, roomElem) {
        try {
            const vbWidth = roomElem.ownerSVGElement?.viewBox?.baseVal?.width || 200;
            const threshold = vbWidth > 400 ? 11 : 4;

            const rBox = getBBoxInParentCoordinates(roomElem);
            return (cell.x - threshold <= rBox.x + rBox.width && cell.x + cell.w + threshold >= rBox.x) &&
                (cell.y - threshold <= rBox.y + rBox.height && cell.y + cell.h + threshold >= rBox.y);
        } catch (e) { return false; }
    }

    function areCellsNeighbors(c1, c2) {
        const threshold = Math.max(c1.w, c1.h) * 0.6;
        const touchX = (c1.x - threshold <= c2.x + c2.w && c1.x + c1.w + threshold >= c2.x);
        const touchY = (c1.y - threshold <= c2.y + c2.h && c1.y + c1.h + threshold >= c2.y);
        return touchX && touchY;
    }

    function findTilePathOnFloor(startRoomElem, destRoomElem, floorId) {
        const floorCells = allGridCells.filter(c => c.floorGroup === floorId);

        const startTiles = floorCells.filter(c => isCellTouchingRoom(c, startRoomElem));
        const destTiles = floorCells.filter(c => isCellTouchingRoom(c, destRoomElem));

        if (startTiles.length === 0 || destTiles.length === 0) return null;

        const getBBoxCenter = (elem) => {
            const bbox = getBBoxInParentCoordinates(elem);
            return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
        };

        const getClosestTileToPoint = (tiles, point) => {
            return tiles.reduce((closest, tile) => {
                const tileCenter = { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 };
                const distToTile = Math.hypot(tileCenter.x - point.x, tileCenter.y - point.y);

                if (!closest) return { tile, dist: distToTile };
                return distToTile < closest.dist ? { tile, dist: distToTile } : closest;
            }, null).tile;
        };

        const startRoomCenter = getBBoxCenter(startRoomElem);
        const destRoomCenter = getBBoxCenter(destRoomElem);

        const startTile = getClosestTileToPoint(startTiles, startRoomCenter);
        const targetTile = getClosestTileToPoint(destTiles, destRoomCenter);

        const targetCenter = { x: targetTile.x + targetTile.w / 2, y: targetTile.y + targetTile.h / 2 };
        const heuristic = (cell) => Math.hypot((cell.x + cell.w / 2) - targetCenter.x, (cell.y + cell.h / 2) - targetCenter.y);

        const openSet = [startTile];
        const cameFrom = new Map();

        const gScore = new Map();
        const fScore = new Map();

        floorCells.forEach(cell => {
            gScore.set(cell, Infinity);
            fScore.set(cell, Infinity);
        });

        gScore.set(startTile, 0);
        fScore.set(startTile, heuristic(startTile));

        while (openSet.length > 0) {
            openSet.sort((a, b) => fScore.get(a) - fScore.get(b));
            const current = openSet.shift();

            if (current === targetTile) {
                const path = [current];
                let currNode = current;
                while (cameFrom.has(currNode)) {
                    currNode = cameFrom.get(currNode);
                    path.unshift(currNode);
                }
                return path;
            }

            const neighbors = floorCells.filter(c => areCellsNeighbors(current, c));

            for (const neighbor of neighbors) {
                const dist = Math.hypot(current.x - neighbor.x, current.y - neighbor.y);
                const tentativeG = gScore.get(current) + dist;

                if (tentativeG < gScore.get(neighbor)) {
                    cameFrom.set(neighbor, current);
                    gScore.set(neighbor, tentativeG);
                    fScore.set(neighbor, tentativeG + heuristic(neighbor));

                    if (!openSet.includes(neighbor)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        return null;
    }

    function getScreenCenter(element) {
        const bbox = element.getBBox();
        const matrix = element.getScreenCTM();
        if (!matrix) {
            throw new Error("Die Position eines Raums oder Übergangs konnte nicht bestimmt werden.");
        }

        const x = bbox.x + bbox.width / 2;
        const y = bbox.y + bbox.height / 2;
        return {
            x: matrix.a * x + matrix.c * y + matrix.e,
            y: matrix.b * x + matrix.d * y + matrix.f
        };
    }

    function findNearestConnectorPair(transportPool, startObj, destObj) {
        const startConnectors = transportPool.filter(connector => connector.floorGroup === startObj.floorGroup);
        const destConnectors = transportPool.filter(connector => connector.floorGroup === destObj.floorGroup);
        const startCenter = getScreenCenter(startObj.element);
        const destCenter = getScreenCenter(destObj.element);
        const pairs = startConnectors.map(startConnector => {
            const destConnector = destConnectors.find(connector =>
                connector.id === startConnector.id || connector.title === startConnector.title
            );
            if (!destConnector) return null;

            const startPosition = getScreenCenter(startConnector.element);
            const destPosition = getScreenCenter(destConnector.element);
            return {
                startConnector,
                destConnector,
                startDistance: Math.hypot(startPosition.x - startCenter.x, startPosition.y - startCenter.y),
                destDistance: Math.hypot(destPosition.x - destCenter.x, destPosition.y - destCenter.y)
            };
        }).filter(pair => pair !== null);

        if (pairs.length === 0) return null;

        const maxRadius = Math.max(...pairs.map(pair => Math.max(pair.startDistance, pair.destDistance)));
        const radiusStep = 25;
        let radius = Math.min(radiusStep, maxRadius);
        let nearbyPairs = pairs.filter(pair =>
            pair.startDistance <= radius && pair.destDistance <= radius
        );

        while (nearbyPairs.length === 0 && radius < maxRadius) {
            radius = Math.min(radius + radiusStep, maxRadius);
            nearbyPairs = pairs.filter(pair =>
                pair.startDistance <= radius && pair.destDistance <= radius
            );
        }

        nearbyPairs.sort((a, b) => {
            const distanceDifference =
                (a.startDistance + a.destDistance) - (b.startDistance + b.destDistance);
            if (Math.abs(distanceDifference) > 0.01) return distanceDifference;
            return a.startConnector.title.localeCompare(b.startConnector.title, "de", { sensitivity: "base" });
        });

        return nearbyPairs[0];
    }

    function findFloorRoute(startObj, destObj, transportPool) {
        if (startObj.floorGroup === destObj.floorGroup) {
            const path = findTilePathOnFloor(startObj.element, destObj.element, startObj.floorGroup);
            return path ? { paths: [path], connectorPair: null } : null;
        }

        const connectorPair = findNearestConnectorPair(transportPool, startObj, destObj);
        if (!connectorPair) return null;

        const startPath = findTilePathOnFloor(
            startObj.element,
            connectorPair.startConnector.element,
            startObj.floorGroup
        );
        const destPath = findTilePathOnFloor(
            connectorPair.destConnector.element,
            destObj.element,
            destObj.floorGroup
        );
        if (!startPath || !destPath) return null;

        return { paths: [startPath, destPath], connectorPair };
    }

    function checkAndCalculatePath() {
        clearPath();
        if (!startRoom || !destinationRoom) {
            renderInfoBox();
            return;
        }

        const startObj = Raum.find(r => r.element === startRoom);
        const destObj = Raum.find(r => r.element === destinationRoom);
        const startBuilding = getBuildingForFloor(startObj.floorGroup);
        const destBuilding = getBuildingForFloor(destObj.floorGroup);

        const visibilityStates = [];
        allFloorGroups.forEach(fg => {
            const wasHidden = fg.classList.contains("hidden-floor");
            visibilityStates.push({ group: fg, wasHidden });
            if (wasHidden) {
                fg.style.setProperty("visibility", "hidden", "important");
                fg.style.setProperty("display", "block", "important");
            }
        });

        if (startBuilding !== destBuilding) {
            const startExit = buildingExits[startBuilding];
            const destExit = buildingExits[destBuilding];
            if (!startExit || !destExit) {
                restoreFloorVisibilities(visibilityStates);
                renderInfoBox("⚠️ Kein Übergang zwischen den Gebäuden gefunden.");
                return;
            }

            const transportPool = selectedTransportMode === 'elevator' ? Aufzug : Treppenhaus;
            const startExitObj = { element: startExit, floorGroup: startExit.ownerSVGElement.id };
            const destExitObj = { element: destExit, floorGroup: destExit.ownerSVGElement.id };
            const startRoute = findFloorRoute(startObj, startExitObj, transportPool);
            const destRoute = findFloorRoute(destExitObj, destObj, transportPool);
            restoreFloorVisibilities(visibilityStates);

            if (startRoute && destRoute) {
                [...startRoute.paths, ...destRoute.paths].forEach(highlightTilePath);
                const usesFloorConnector = startRoute.connectorPair || destRoute.connectorPair;
                const connectorDescription = selectedTransportMode === 'elevator' ? "den Aufzug" : "die Treppe";
                renderInfoBox(`✅ Kachel-Pfad über den IC-Ausgang${usesFloorConnector ? ` und ${connectorDescription}` : ""} berechnet.`);
            } else {
                renderInfoBox("⚠️ Pfad über den IC-Ausgang konnte nicht vollständig berechnet werden.");
            }
            return;
        }

        if (startObj.floorGroup === destObj.floorGroup) {
            const path = findTilePathOnFloor(startRoom, destinationRoom, startObj.floorGroup);
            restoreFloorVisibilities(visibilityStates);

            if (path) {
                highlightTilePath(path);
                renderInfoBox(`✅ Kachel-Pfad auf dieser Ebene berechnet! (${path.length} Kacheln)`);
            } else {
                renderInfoBox(`⚠️ Kein Kachel-Weg zwischen den Räumen gefunden.`);
            }
            return;
        }

        const transportPool = selectedTransportMode === 'elevator' ? Aufzug : Treppenhaus;
        const transportName = selectedTransportMode === 'elevator' ? 'Aufzug' : 'Treppe';

        const connectorPair = findNearestConnectorPair(transportPool, startObj, destObj);
        if (!connectorPair) {
            restoreFloorVisibilities(visibilityStates);
            renderInfoBox(`⚠️ Kein Übergang via ${transportName} gefunden.`);
            return;
        }

        const { startConnector, destConnector } = connectorPair;
        const path1 = findTilePathOnFloor(startRoom, startConnector.element, startObj.floorGroup);
        const path2 = findTilePathOnFloor(destConnector.element, destinationRoom, destObj.floorGroup);

        restoreFloorVisibilities(visibilityStates);

        if (path1 && path2) {
            highlightTilePath(path1);
            highlightTilePath(path2);
            renderInfoBox(`✅ Kachel-Pfad via ${transportName} '${startConnector.id}' berechnet!`);
        } else {
            renderInfoBox(`⚠️ Pfad über ${transportName} konnte nicht vollständig berechnet werden.`);
        }
    }

    // FEHLER 4 BEHOBEN: Beide Ebenen kurz für getBBox() messbar machen
    allFloorGroups.forEach(fg => {
        fg.style.setProperty("visibility", "hidden", "important");
        fg.style.setProperty("display", "block", "important");
    });
    renderRoomLabels();
    gridifyAndColorHallways();
    allFloorGroups.forEach(fg => {
        fg.style.removeProperty("visibility");
        fg.style.removeProperty("display");
    });
    switchFloor(0);

    function onRoomClick(targetElement) {
        selectedRoomElement = targetElement;
        const roomObj = Raum.find(r => r.element === targetElement);

        if (!startRoom) {
            startRoom = targetElement;
            startInput.value = roomObj
                ? formatRoomDisplayId(roomObj.id, getBuildingForFloor(roomObj.floorGroup))
                : "Raum gewählt";
            labelStartFloor.textContent = `Start-Etage: ${roomObj ? getFloorLabelForGroup(roomObj.floorGroup) : getFloorLabel(currentBuilding, currentFloor)}`;
        } else if (!destinationRoom && targetElement !== startRoom) {
            destinationRoom = targetElement;
            destInput.value = roomObj
                ? formatRoomDisplayId(roomObj.id, getBuildingForFloor(roomObj.floorGroup))
                : "Raum gewählt";
            labelDestFloor.textContent = `Ziel-Etage: ${roomObj ? getFloorLabelForGroup(roomObj.floorGroup) : getFloorLabel(currentBuilding, currentFloor)}`;
        } else {
            destinationRoom = targetElement;
            destInput.value = roomObj
                ? formatRoomDisplayId(roomObj.id, getBuildingForFloor(roomObj.floorGroup))
                : "Raum gewählt";
            labelDestFloor.textContent = `Ziel-Etage: ${roomObj ? getFloorLabelForGroup(roomObj.floorGroup) : getFloorLabel(currentBuilding, currentFloor)}`;
        }

        updateSelectedRoomHighlights();
        updateClearButtons();
        checkAndCalculatePath();
    }

    transportOptions.forEach(option => {
        option.addEventListener("click", () => {
            transportOptions.forEach(opt => opt.classList.remove("active"));
            option.classList.add("active");

            selectedTransportMode = option.getAttribute("data-mode");
            checkAndCalculatePath();
        });
    });

    function renderInfoBox(customMessage = null) {
        if (!infoText) return;
        if (!selectedRoomElement && !customMessage) {
            infoText.innerHTML = "Kein Raum ausgewählt.";
            return;
        }

        const roomObj = Raum.find(r => r.element === selectedRoomElement);
        const roomBuilding = roomObj ? getBuildingForFloor(roomObj.floorGroup) : currentBuilding;
        const roomId = roomObj ? formatRoomDisplayId(roomObj.id, roomBuilding) : "";
        const titleInfo = roomObj && roomObj.title && roomObj.title !== roomObj.id
            ? ` - ${roomObj.title}`
            : "";

        const startObj = Raum.find(r => r.element === startRoom);
        const destObj = Raum.find(r => r.element === destinationRoom);

        let html = `
            <div class="action-card">
                <h3>Raum: <strong>${roomId}</strong>${titleInfo}</h3>
                <div class="action-buttons">
                    <button id="btn-info" class="btn btn-info">ℹ️ Info</button>
                    <button id="btn-start" class="btn btn-location">📍 Als Start setzen</button>
                    <button id="btn-dest" class="btn btn-destination">🏁 Als Ziel setzen</button>
                    <button id="btn-reset" class="btn btn-reset">❌ Reset</button>
                </div>

                <div style="margin-top: 12px;">
                    <label><strong>Verbindung zwischen Etagen:</strong></label>
                    <div class="transport-selector">
                        <button id="mode-staircase" class="btn-transport ${selectedTransportMode === 'staircase' ? 'active' : ''}">🚶 Via Treppe</button>
                        <button id="mode-elevator" class="btn-transport ${selectedTransportMode === 'elevator' ? 'active' : ''}">🛗 Via Aufzug</button>
                    </div>
                </div>

                <div id="extra-info-content" style="margin-top:10px;"></div>
            </div>
        `;

        if (startRoom || destinationRoom) {
            html += `
                <div class="route-summary">
                    <strong>Routen-Planung:</strong><br>
                    Start: <strong>${startObj ? formatRoomDisplayId(startObj.id, getBuildingForFloor(startObj.floorGroup)) : "Nicht gewählt"}</strong><br>
                    Ziel: <strong>${destObj ? formatRoomDisplayId(destObj.id, getBuildingForFloor(destObj.floorGroup)) : "Nicht gewählt"}</strong>
                    ${customMessage ? `<br><span style="color:#d32f2f;"><strong>${customMessage}</strong></span>` : ''}
                </div>
            `;
        }

        infoText.innerHTML = html;

        document.getElementById("mode-staircase")?.addEventListener("click", () => {
            selectedTransportMode = 'staircase';
            renderInfoBox();
            checkAndCalculatePath();
        });

        document.getElementById("mode-elevator")?.addEventListener("click", () => {
            selectedTransportMode = 'elevator';
            renderInfoBox();
            checkAndCalculatePath();
        });

        document.getElementById("btn-info")?.addEventListener("click", () => {
            const extraInfo = document.getElementById("extra-info-content");
            if (extraInfo) extraInfo.innerHTML = `<p>ℹ️ Raum-ID: ${roomId}.</p>`;
        });
        document.getElementById("btn-start")?.addEventListener("click", () => {
            startRoom = selectedRoomElement;
            if (startRoom && startInput) startInput.value = roomId;
            updateSelectedRoomHighlights();
            updateClearButtons();
            createRoomLabel(startRoom, "green", roomId);
            checkAndCalculatePath();
        });
        document.getElementById("btn-dest")?.addEventListener("click", () => {
            destinationRoom = selectedRoomElement;
            if (destinationRoom && destInput) destInput.value = roomId;
            updateSelectedRoomHighlights();
            updateClearButtons();
            createRoomLabel(destinationRoom, "green", roomId);
            checkAndCalculatePath();
        });
        document.getElementById("btn-reset")?.addEventListener("click", () => {
            clearPath();
            startRoom = null;
            destinationRoom = null;
            selectedRoomElement = null;
            if (startInput) startInput.value = "";
            if (destInput) destInput.value = "";
            updateSelectedRoomHighlights();
            updateClearButtons();
            renderRoomLabels();
            infoText.innerHTML = "Auswahl zurückgesetzt.";
        });
    }

    function restoreFloorVisibilities(states) {
        states.forEach(state => {
            if (state.wasHidden) {
                state.group.style.removeProperty("visibility");
                state.group.style.removeProperty("display");
            }
        });
    }

    // ==========================================
    // AKTUELLE LIVE-SUCHLOGIK & ENTER-STEUERUNG
    // ==========================================
    let activeSearchInput = null;

    function cleanString(str) {
        return str.toLowerCase()
            .replace(/^(?:id|ic)\d+_/, "")
            .replace(/^(?:id|ic)(?=\d)/, "")
            .replace(/^raum_/, "")
            .trim();
    }

    function formatRoomDisplayId(roomId, building) {
        return roomId.replace(/^(?:ID|IC)\d+_/i, "")
            .replace(/^Raum_(\d+)$/i, `${building}$1`);
    }

    function updateSelectedRoomHighlights() {
        Raum.forEach(room => room.element.classList.remove("selected-room"));
        if (startRoom) startRoom.classList.add("selected-room");
        if (destinationRoom) destinationRoom.classList.add("selected-room");
    }

    const inputMeasureContext = document.createElement("canvas").getContext("2d");

    function fitSearchInputText(input) {
        const styles = getComputedStyle(input);
        const text = input.value || input.placeholder;
        const maxFontSize = 14;
        const minFontSize = 10;

        if (!inputMeasureContext || input.clientWidth <= 0) {
            input.style.fontSize = `${maxFontSize}px`;
            return;
        }

        let fontSize = maxFontSize;
        while (fontSize > minFontSize) {
            inputMeasureContext.font = `${styles.fontWeight} ${fontSize}px ${styles.fontFamily}`;
            if (inputMeasureContext.measureText(text).width <= input.clientWidth) break;
            fontSize -= 0.5;
        }
        input.style.fontSize = `${fontSize}px`;
    }

    function updateClearButtons() {
        if (destInput) fitSearchInputText(destInput);
        if (startInput) fitSearchInputText(startInput);
        if (clearDestButton) clearDestButton.hidden = !destInput?.value;
        if (clearStartButton) clearStartButton.hidden = !startInput?.value;
    }

    function handleSearchInput(inputElem) {
        if (!searchResults) return;
        const originalValue = inputElem.value;
        const formattedValue = originalValue.replace(/^Raum_(?=\d)/i, "ID");
        if (formattedValue !== originalValue) {
            const cursorPosition = inputElem.selectionStart ?? originalValue.length;
            const cursorOffset = formattedValue.length - originalValue.length;
            inputElem.value = formattedValue;
            inputElem.setSelectionRange(
                Math.max(0, cursorPosition + cursorOffset),
                Math.max(0, cursorPosition + cursorOffset)
            );
        }
        const rawValue = inputElem.value.trim();
        const query = cleanString(inputElem.value);
        activeSearchInput = inputElem;
        updateClearButtons();

        if (!rawValue) {
            if (inputElem === startInput) {
                startRoom = null;
                if (labelStartFloor) labelStartFloor.textContent = "Start-Etage: -";
            } else if (inputElem === destInput) {
                destinationRoom = null;
                if (labelDestFloor) labelDestFloor.textContent = "Ziel-Etage: -";
            }

            updateSelectedRoomHighlights();
            searchResults.classList.remove("active");
            searchResults.innerHTML = "";

            renderRoomLabels();
            checkAndCalculatePath();
            return;
        }

        const matches = Raum.filter(r => {
            const cleanId = cleanString(r.id);
            const cleanRaw = cleanString(r.rawId || "");
            return (cleanId.includes(query) || cleanRaw.includes(query)) &&
                !r.isFlur && !r.isTreppenhaus && !r.isAufzug;
        });

        if (matches.length === 0) {
            searchResults.classList.remove("active");
            searchResults.innerHTML = "";
            return;
        }

        searchResults.innerHTML = matches.map(r =>
            `<div class="search-item" data-unique-id="${r.uniqueId}">${formatRoomDisplayId(r.id, getBuildingForFloor(r.floorGroup))} (${getFloorLabelForGroup(r.floorGroup)})</div>`
        ).join("");

        searchResults.classList.add("active");
    }

    function selectRoomFromObject(roomObj, inputElem) {
        if (!roomObj) return;

        const floorLabel = getFloorLabelForGroup(roomObj.floorGroup);

        showRoomFloor(roomObj);

        if (inputElem === startInput) {
            startRoom = roomObj.element;
            startInput.value = `${formatRoomDisplayId(roomObj.id, getBuildingForFloor(roomObj.floorGroup))} (${floorLabel})`;
            if (labelStartFloor) labelStartFloor.textContent = `Start-Etage: ${floorLabel}`;
            createRoomLabel(startRoom, "green", roomObj.id);
        } else {
            destinationRoom = roomObj.element;
            destInput.value = `${formatRoomDisplayId(roomObj.id, getBuildingForFloor(roomObj.floorGroup))} (${floorLabel})`;
            if (labelDestFloor) labelDestFloor.textContent = `Ziel-Etage: ${floorLabel}`;
            createRoomLabel(destinationRoom, "red", roomObj.id);
        }

        updateSelectedRoomHighlights();
        updateClearButtons();
        checkAndCalculatePath();

        if (searchResults) {
            searchResults.classList.remove("active");
            searchResults.innerHTML = "";
        }
    }

    destInput?.addEventListener("input", () => handleSearchInput(destInput));
    startInput?.addEventListener("input", () => handleSearchInput(startInput));
    clearDestButton?.addEventListener("click", () => {
        if (destInput) {
            destInput.value = "";
            handleSearchInput(destInput);
        }
    });
    clearStartButton?.addEventListener("click", () => {
        if (startInput) {
            startInput.value = "";
            handleSearchInput(startInput);
        }
    });

    [destInput, startInput].forEach(input => {
        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const query = cleanString(input.value);

                const match = Raum.find(r => cleanString(r.id) === query || cleanString(r.rawId || "") === query) ||
                    Raum.find(r => cleanString(r.id).includes(query));

                if (match) {
                    selectRoomFromObject(match, input);
                    input.blur();
                }
            }
        });
    });

    searchResults?.addEventListener("click", (e) => {
        const target = e.target.closest(".search-item");
        if (!target) return;

        const uniqueId = target.getAttribute("data-unique-id");
        const roomObj = Raum.find(r => r.uniqueId === uniqueId);

        if (roomObj && activeSearchInput) {
            selectRoomFromObject(roomObj, activeSearchInput);
        }
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".top-search-card")) {
            searchResults?.classList.remove("active");
        }
    });
});