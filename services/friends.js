const friendsSurface = (() => {
    let overlay = null;
    let inlineRoot = null;
    let activePlatform = "all";
    let lastData = null;
    let selectedFriendIndex = 0;
    let inputFocus = "platforms";

    const platforms = {
        discord: { label: "Discord", short: "DISCORD", icon: "D" },
        microsoft: { label: "Xbox", short: "XBOX", icon: "X" },
        steam: { label: "Steam", short: "STEAM", icon: "S" },
        riot: { label: "Riot Games", short: "RIOT", icon: "R" }
    };

    function ensure() {
        if (overlay) return overlay;
        overlay = document.createElement("div");
        overlay.id = "friends-overlay";
        overlay.innerHTML = `<section class="friends-panel" role="dialog" aria-modal="true" aria-labelledby="friends-title">
            <header class="friends-header"><div><div class="friends-kicker">SOCIAL</div><h2 id="friends-title">Friends</h2><p id="friends-summary">Your friends and their current activity.</p></div><button id="friends-close" class="friends-close" type="button">ESC</button></header>
            <nav id="friends-platforms" class="friends-platforms" aria-label="Friend platforms"></nav>
            <main id="friends-content" class="friends-content"></main>
            <footer class="friends-footer"><span id="friends-updated">Waiting for friend activity...</span><button id="friends-refresh" type="button">Refresh</button></footer>
        </section>`;
        document.body.appendChild(overlay);
        overlay.querySelector("#friends-close").addEventListener("click", close);
        overlay.querySelector("#friends-refresh").addEventListener("click", refresh);
        return overlay;
    }

    function ensureInline(host) {
        if (
            inlineRoot &&
            inlineRoot.parentElement === host
        ) {
            return inlineRoot;
        }

        closeInline();

        inlineRoot = document.createElement("section");
        inlineRoot.className = "friends-inline";
        inlineRoot.innerHTML = `<section class="friends-panel" aria-labelledby="friends-inline-title">
            <header class="friends-header">
                <div>
                    <div class="friends-kicker">SOCIAL</div>
                    <h2 id="friends-inline-title">Friends</h2>
                    <p data-friends-role="summary">Your friends and their current activity.</p>
                </div>
            </header>
            <nav data-friends-role="platforms" class="friends-platforms" aria-label="Friend platforms"></nav>
            <main data-friends-role="content" class="friends-content"></main>
            <footer class="friends-footer">
                <span data-friends-role="updated">Waiting for friend activity...</span>
                <button data-friends-role="refresh" type="button">Refresh</button>
            </footer>
        </section>`;

        host.appendChild(inlineRoot);
        inlineRoot.querySelector('[data-friends-role="refresh"]').addEventListener("click", refresh);
        return inlineRoot;
    }

    function closeInline() {
        inlineRoot?.remove();
        inlineRoot = null;
    }

    function openInline(host) {
        if (!host) return;
        const root = ensureInline(host);
        if (root.dataset.loaded === "true") return;
        root.dataset.loaded = "true";
        refresh();
    }

    function normalizeFriend(friend) {
        const activity = friend?.activity;
        return {
            id: String(friend?.id || "unknown"),
            platform: friend?.platform || "discord",
            name: String(friend?.name || "Unknown friend"),
            avatar: typeof friend?.avatar === "string" ? friend.avatar : "",
            status: ["online", "idle", "dnd", "offline"].includes(friend?.status) ? friend.status : "offline",
            activity: activity?.type === "game" ? {
                name: String(activity.name || "Unknown game"),
                details: String(activity.details || ""),
                state: String(activity.state || ""),
                startedAt: Number.isFinite(activity.startedAt) ? activity.startedAt : null,
                artwork: typeof activity.artwork === "string" ? activity.artwork : ""
            } : null
        };
    }

    function getFriends(data) {
        return (Array.isArray(data?.friends) ? data.friends : [])
            .map(normalizeFriend)
            .filter(friend => platforms[friend.platform]);
    }

    function statusLabel(status) {
        return { online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline" }[status] || "Offline";
    }

    function formatDuration(startedAt) {
        if (!startedAt) return "";
        const minutes = Math.floor(Math.max(0, Date.now() - startedAt) / 60000);
        if (minutes < 1) return "Playing now";
        if (minutes < 60) return `Playing for ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        return remainder ? `Playing for ${hours}h ${remainder}m` : `Playing for ${hours}h`;
    }

    function platformBadge(platform) {
        const badge = document.createElement("span");
        badge.className = `friends-platform-badge platform-${platform}`;
        badge.textContent = platforms[platform]?.icon || "?";
        badge.title = platforms[platform]?.label || platform;
        return badge;
    }

    function createFriendCard(friend) {
        const card = document.createElement("article");
        card.className = `friend-card is-${friend.status}`;
        card.dataset.friendId = friend.id;

        const identity = document.createElement("div");
        identity.className = "friend-identity";

        const avatar = document.createElement("div");
        avatar.className = "friends-avatar";
        const image = document.createElement("img");
        image.className = "friends-avatar-image";
        image.alt = "";
        image.src = friend.avatar || "";
        if (!friend.avatar) {
            image.style.display = "none";
            const fallback = document.createElement("span");
            fallback.className = "friends-avatar-fallback";
            fallback.textContent = friend.name.charAt(0).toUpperCase();
            avatar.appendChild(fallback);
        } else {
            image.addEventListener("error", () => {
                image.style.display = "none";
                const fallback = document.createElement("span");
                fallback.className = "friends-avatar-fallback";
                fallback.textContent = friend.name.charAt(0).toUpperCase();
                avatar.appendChild(fallback);
            }, { once: true });
            avatar.appendChild(image);
        }

        const dot = document.createElement("span");
        dot.className = "friends-status-dot";
        dot.title = statusLabel(friend.status);
        avatar.appendChild(dot);

        const identityText = document.createElement("div");
        identityText.className = "friend-identity-text";
        const nameRow = document.createElement("div");
        nameRow.className = "friend-name-row";
        const name = document.createElement("div");
        name.className = "friend-name";
        name.textContent = friend.name;
        nameRow.append(name, platformBadge(friend.platform));
        const status = document.createElement("div");
        status.className = "friend-status-label";
        status.textContent = statusLabel(friend.status);
        identityText.append(nameRow, status);
        identity.append(avatar, identityText);
        card.appendChild(identity);

        if (friend.activity) {
            const activity = document.createElement("div");
            activity.className = "friend-activity";
            if (friend.activity.artwork) {
                const art = document.createElement("img");
                art.className = "friend-game-art";
                art.alt = "";
                art.loading = "lazy";
                art.src = friend.activity.artwork;
                art.addEventListener("error", () => art.remove(), { once: true });
                activity.appendChild(art);
            }
            const text = document.createElement("div");
            text.className = "friend-activity-text";
            const game = document.createElement("div");
            game.className = "friend-game";
            game.textContent = friend.activity.name;
            const details = document.createElement("div");
            details.className = "friend-game-details";
            details.textContent = friend.activity.details || friend.activity.state || "Playing";
            text.append(game, details);
            const duration = formatDuration(friend.activity.startedAt);
            if (duration) {
                const time = document.createElement("div");
                time.className = "friend-game-time";
                time.textContent = duration;
                text.appendChild(time);
            }
            activity.appendChild(text);
            card.appendChild(activity);
        } else if (friend.status !== "offline") {
            const activity = document.createElement("div");
            activity.className = "friend-no-activity";
            activity.textContent = "Online";
            card.appendChild(activity);
        }

        return card;
    }

    function renderGameGroup(gameName, friends) {
        const group = document.createElement("section");
        group.className = "friends-game-group";
        const heading = document.createElement("div");
        heading.className = "friends-game-heading";
        const title = document.createElement("h3");
        title.textContent = gameName;
        const count = document.createElement("span");
        count.textContent = String(friends.length);
        heading.append(title, count);
        group.appendChild(heading);
        const list = document.createElement("div");
        list.className = "friends-list";
        friends.forEach(friend => list.appendChild(createFriendCard(friend)));
        group.appendChild(list);
        return group;
    }

    function renderPlatform(platform, friends) {
        const section = document.createElement("section");
        section.className = "friends-platform-section";
        const heading = document.createElement("div");
        heading.className = "friends-section-heading";
        const wrap = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = platforms[platform].label;
        const subtitle = document.createElement("span");
        subtitle.textContent = `${friends.length} friend${friends.length === 1 ? "" : "s"}`;
        wrap.append(title, subtitle);
        heading.append(wrap, platformBadge(platform));
        section.appendChild(heading);

        const online = friends.filter(friend => friend.status !== "offline");
        const offline = friends.filter(friend => friend.status === "offline");
        const games = new Map();

        online.forEach(friend => {
            const key = friend.activity?.name || "Online";
            if (!games.has(key)) games.set(key, []);
            games.get(key).push(friend);
        });

        games.forEach((gameFriends, gameName) => section.appendChild(renderGameGroup(gameName, gameFriends)));

        if (offline.length) {
            section.appendChild(renderGameGroup("Offline", offline));
        }

        return section;
    }

    function renderEmpty(root) {
        const empty = document.createElement("div");
        empty.className = "friends-empty";
        const title = document.createElement("h3");
        title.textContent = "No friend activity yet";
        const body = document.createElement("p");
        body.textContent = "The unified Friends surface is ready for platform activity. Connect a supported platform, then refresh this view.";
        empty.append(title, body);
        root.appendChild(empty);
    }

    function render(data) {
        lastData = data || {};
        const root = inlineRoot || ensure();
        const content = root.querySelector('#friends-content, [data-friends-role="content"]');
        const nav = root.querySelector('#friends-platforms, [data-friends-role="platforms"]');
        const summary = root.querySelector('#friends-summary, [data-friends-role="summary"]');
        const friends = getFriends(lastData);
        const available = new Set(friends.map(friend => friend.platform));
        content.innerHTML = "";
        nav.innerHTML = "";

        const all = document.createElement("button");
        all.type = "button";
        all.textContent = "All";
        all.className = activePlatform === "all" ? "active" : "";
        all.addEventListener("mouseenter", () => { inputFocus = "platforms"; });
        all.addEventListener("focus", () => { inputFocus = "platforms"; });
        all.addEventListener("click", () => { inputFocus = "platforms"; activePlatform = "all"; render(lastData); });
        nav.appendChild(all);

        Object.keys(platforms).forEach(platform => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = platforms[platform].short;
            button.disabled = !available.has(platform);
            button.className = activePlatform === platform ? "active" : "";
            button.addEventListener("mouseenter", () => { inputFocus = "platforms"; });
            button.addEventListener("focus", () => { inputFocus = "platforms"; });
            button.addEventListener("click", () => { inputFocus = "platforms"; activePlatform = platform; render(lastData); });
            nav.appendChild(button);
        });

        const filtered = activePlatform === "all" ? friends : friends.filter(friend => friend.platform === activePlatform);
        const onlineCount = filtered.filter(friend => friend.status !== "offline").length;
        summary.textContent = friends.length ? `${onlineCount} online · ${filtered.length} total` : "No friend activity has been received yet.";

        if (!filtered.length) {
            renderEmpty(content);
        } else if (activePlatform === "all") {
            Object.keys(platforms).forEach(platform => {
                const platformFriends = filtered.filter(friend => friend.platform === platform);
                if (platformFriends.length) content.appendChild(renderPlatform(platform, platformFriends));
            });
        } else {
            content.appendChild(renderPlatform(activePlatform, filtered));
        }

        const cards = Array.from(content.querySelectorAll(".friend-card"));
        selectedFriendIndex = Math.max(0, Math.min(selectedFriendIndex, cards.length - 1));
        cards.forEach((card, index) => {
            card.dataset.friendIndex = String(index);
            card.tabIndex = 0;
            card.classList.toggle("selected", index === selectedFriendIndex);
            card.addEventListener("mouseenter", () => {
                inputFocus = "friends";
                setFriendSelection(index);
            });
            card.addEventListener("focus", () => {
                inputFocus = "friends";
                setFriendSelection(index);
            });
            card.addEventListener("click", () => selectFriend(index));
        });

        const updated = root.querySelector('#friends-updated, [data-friends-role="updated"]');
        if (updated) {
            updated.textContent =
                `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
        }
    }

    async function refresh() {
        const root = inlineRoot || ensure();
        const button = root.querySelector('#friends-refresh, [data-friends-role="refresh"]');
        button.disabled = true;
        try {
            const data = await window.electron?.getFriends?.() || { friends: [] };
            render(data);

            if (data.error) {
                const updated = root.querySelector('#friends-updated, [data-friends-role="updated"]');
                if (updated) updated.textContent = data.error;
            }
        } catch (error) {
            console.error("Friends refresh failed:", error);
            render({ friends: [] });
        } finally {
            button.disabled = false;
        }
    }

    function getInlineRoot() {
        return inlineRoot;
    }

    function getFriendCards() {
        return Array.from(inlineRoot?.querySelectorAll(".friend-card") || []);
    }

    function setFriendSelection(index) {
        const cards = getFriendCards();
        if (!cards.length) return;
        selectedFriendIndex = Math.max(0, Math.min(index, cards.length - 1));
        cards.forEach((card, cardIndex) => {
            card.classList.toggle("selected", cardIndex === selectedFriendIndex);
        });
        const selected = cards[selectedFriendIndex];
        selected?.scrollIntoView({block:"nearest", inline:"nearest", behavior:"smooth"});
    }

    function getPlatformButtons() {
        return Array.from(
            inlineRoot?.querySelectorAll(".friends-platforms button:not(:disabled)") || []
        );
    }

    function focusPlatforms() {
        inputFocus = "platforms";
        const buttons = getPlatformButtons();
        if (!buttons.length) return false;
        buttons.forEach(button => button.classList.toggle("input-selected", button.classList.contains("active")));
        buttons.find(button => button.classList.contains("active"))?.focus({ preventScroll: true });
        getFriendCards().forEach(card => card.classList.remove("selected"));
        return true;
    }

    function focusFriends() {
        const cards = getFriendCards();
        if (!cards.length) return false;
        inputFocus = "friends";
        setFriendSelection(selectedFriendIndex);
        cards[selectedFriendIndex]?.focus({ preventScroll: true });
        return true;
    }

    function moveSelection(direction) {
        const cards = getFriendCards();
        if (!cards.length) return false;

        const current = cards[selectedFriendIndex];
        if (!current) {
            setFriendSelection(0);
            return true;
        }

        const rect = current.getBoundingClientRect();
        const currentCenterX = rect.left + rect.width / 2;
        const currentCenterY = rect.top + rect.height / 2;

        const candidates = cards
            .map((card, index) => ({ card, index, rect: card.getBoundingClientRect() }))
            .filter(entry => entry.index !== selectedFriendIndex);

        const vertical = candidates.filter(entry =>
            direction > 0
                ? entry.rect.top > rect.bottom - 2
                : entry.rect.bottom < rect.top + 2
        );

        const pool = vertical.length ? vertical : candidates;
        if (!pool.length) return true;

        pool.sort((a, b) => {
            const aCenterX = a.rect.left + a.rect.width / 2;
            const aCenterY = a.rect.top + a.rect.height / 2;
            const bCenterX = b.rect.left + b.rect.width / 2;
            const bCenterY = b.rect.top + b.rect.height / 2;
            const aScore = Math.abs(aCenterY - currentCenterY) * 4 + Math.abs(aCenterX - currentCenterX);
            const bScore = Math.abs(bCenterY - currentCenterY) * 4 + Math.abs(bCenterX - currentCenterX);
            return aScore - bScore;
        });

        setFriendSelection(pool[0].index);
        return true;
    }

    function moveFriendHorizontal(direction) {
        const cards = getFriendCards();
        if (!cards.length) return false;

        const current = cards[selectedFriendIndex];
        if (!current) return true;

        const rect = current.getBoundingClientRect();
        const currentCenterY = rect.top + rect.height / 2;
        const currentCenterX = rect.left + rect.width / 2;

        const candidates = cards
            .map((card, index) => ({ card, index, rect: card.getBoundingClientRect() }))
            .filter(entry => {
                if (entry.index === selectedFriendIndex) return false;
                const centerY = entry.rect.top + entry.rect.height / 2;
                const centerX = entry.rect.left + entry.rect.width / 2;
                return Math.abs(centerY - currentCenterY) < Math.max(rect.height, entry.rect.height) * 0.65 &&
                    (direction > 0 ? centerX > currentCenterX : centerX < currentCenterX);
            });

        if (!candidates.length) return true;

        candidates.sort((a, b) => {
            const aCenterX = a.rect.left + a.rect.width / 2;
            const bCenterX = b.rect.left + b.rect.width / 2;
            return Math.abs(aCenterX - currentCenterX) - Math.abs(bCenterX - currentCenterX);
        });

        setFriendSelection(candidates[0].index);
        return true;
    }

    function selectFriend(index = selectedFriendIndex) {
        const cards = getFriendCards();
        if (!cards.length) return null;
        setFriendSelection(index);
        const card = cards[selectedFriendIndex];
        card?.classList.add("selected-pulse");
        window.setTimeout(() => card?.classList.remove("selected-pulse"), 220);
        window.xmbAudio?.select?.();
        return lastData?.friends?.find(friend => String(friend?.id || "") === String(card?.dataset?.friendId || "")) || null;
    }

    function movePlatform(direction) {
        const buttons = getPlatformButtons();
        if (!buttons.length) return false;
        inputFocus = "platforms";
        const current = Math.max(0, buttons.findIndex(button => button.classList.contains("active")));
        const next = (current + direction + buttons.length) % buttons.length;
        buttons[next].click();
        return true;
    }

    function getInputFocus() {
        return inputFocus;
    }

    function isInlineActive() {
        return Boolean(inlineRoot);
    }

    function open() {
        closeInline();
        ensure().classList.add("visible");
        refresh();
    }

    function close() {
        overlay?.classList.remove("visible");
    }
    function isOpen() { return !!overlay?.classList.contains("visible"); }

    document.addEventListener("keydown", event => {
        if (!isOpen()) return;
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    }, true);

    document.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.repeat) return;
        const state = window.xmbNavigation?.getState?.();
        if (state?.item === "friends-overview" && state.level === "items") {
            event.preventDefault();
            event.stopImmediatePropagation();
            open();
        }
    }, true);

    return { open, close, openInline, closeInline, refresh, isOpen, render, moveSelection, moveFriendHorizontal, movePlatform, focusPlatforms, focusFriends, getInputFocus, getFriendCards, selectFriend, setFriendSelection, isInlineActive };
})();

window.friendsSurface = friendsSurface;
