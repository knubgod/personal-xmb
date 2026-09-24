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
            <div class="friends-main-row">
                <main data-friends-role="content" class="friends-content"></main>
                <aside data-friends-role="preview" class="friend-preview" aria-live="polite"></aside>
            </div>
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

        /*
            Every time Friends becomes the active XMB surface,
            keyboard/controller focus starts on the platform bar.
        */
        inputFocus = "platforms";

        if (root.dataset.loaded === "true") {
            focusPlatforms();
            return;
        }

        root.dataset.loaded = "true";
        refresh().then(() => {
            focusPlatforms();
        });
    }

    function normalizeFriend(friend) {
        const activity = friend?.activity;
        return {
            id: String(friend?.id || "unknown"),
            platform: friend?.platform || "discord",
            name: String(friend?.name || "Unknown friend"),
            avatar: typeof friend?.avatar === "string" ? friend.avatar : "",
            status: ["online", "idle", "dnd", "offline", "unknown"].includes(friend?.status) ? friend.status : "offline",
            username: String(friend?.username || ""),
            discriminator: String(friend?.discriminator || ""),
            presenceAvailable: friend?.presenceAvailable !== false,
            relationshipType: Number.isFinite(friend?.relationshipType) ? friend.relationshipType : null,
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
        return {
            online: "Online",
            idle: "Idle",
            dnd: "Do Not Disturb",
            offline: "Offline",
            unknown: "Presence unavailable"
        }[status] || "Offline";
    }

    function isPresent(friend) {
        return ["online", "idle", "dnd"].includes(friend.status);
    }

    function relationshipLabel(type) {
        return {
            1: "Discord friend",
            2: "Blocked",
            3: "Incoming friend request",
            4: "Outgoing friend request"
        }[type] || "Discord friend";
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

        const online = friends.filter(isPresent);
        const unknown = friends.filter(friend => friend.status === "unknown");
        const offline = friends.filter(friend => friend.status === "offline");
        const games = new Map();

        online.forEach(friend => {
            const key = friend.activity?.name || "Online";
            if (!games.has(key)) games.set(key, []);
            games.get(key).push(friend);
        });

        games.forEach((gameFriends, gameName) => section.appendChild(renderGameGroup(gameName, gameFriends)));

        if (unknown.length) {
            section.appendChild(renderGameGroup("Presence unavailable", unknown));
        }

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
        all.tabIndex = -1;
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
            button.tabIndex = -1;
            button.addEventListener("mouseenter", () => { inputFocus = "platforms"; });
            button.addEventListener("focus", () => { inputFocus = "platforms"; });
            button.addEventListener("click", () => { inputFocus = "platforms"; activePlatform = platform; render(lastData); });
            nav.appendChild(button);
        });

        const filtered = activePlatform === "all" ? friends : friends.filter(friend => friend.platform === activePlatform);
        const onlineCount = filtered.filter(isPresent).length;
        summary.textContent = friends.length
            ? String(onlineCount) + " online · " + filtered.length + " total"
            : "No friend activity has been received yet.";

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

        const selectedFriend = getSelectedFriend();
        renderFriendPreview(selectedFriend);

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
            const [steamData, discordData] = await Promise.all([
                window.electron?.getFriends?.() || { friends: [] },
                window.electron?.discordGetFriends?.() || { friends: [], configured: false }
            ]);

            const data = {
                friends: [
                    ...(Array.isArray(steamData?.friends) ? steamData.friends : []),
                    ...(Array.isArray(discordData?.friends) ? discordData.friends : [])
                ],
                error: [
                    steamData?.error,
                    discordData?.configured ? discordData?.error : ""
                ].filter(Boolean).join(" · ")
            };

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
        if (!selected) return;

        renderFriendPreview(getSelectedFriend());

        /*
            The friend list itself is the scrolling viewport.
            The platform bar stays fixed while the selected
            friend moves through the visible list.

            Only scroll when the selected card crosses the
            visible top/bottom edge.
        */
        const content = inlineRoot?.querySelector(".friends-content");
        if (!content) return;

        const contentRect = content.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();
        const topBuffer = 10;
        const bottomBuffer = 10;

        if (selectedRect.top < contentRect.top + topBuffer) {
            content.scrollBy({
                top: selectedRect.top - contentRect.top - topBuffer,
                behavior: "smooth"
            });
        } else if (selectedRect.bottom > contentRect.bottom - bottomBuffer) {
            content.scrollBy({
                top: selectedRect.bottom - contentRect.bottom + bottomBuffer,
                behavior: "smooth"
            });
        }
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
        /*
            Friends uses logical focus rather than native button focus.
            This prevents Chromium's button behavior from interfering
            with the XMB ArrowDown/ArrowRight navigation.
        */
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
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

        if (!vertical.length) return false;

        vertical.sort((a, b) => {
            const aCenterX = a.rect.left + a.rect.width / 2;
            const aCenterY = a.rect.top + a.rect.height / 2;
            const bCenterX = b.rect.left + b.rect.width / 2;
            const bCenterY = b.rect.top + b.rect.height / 2;
            const aScore = Math.abs(aCenterY - currentCenterY) * 4 + Math.abs(aCenterX - currentCenterX);
            const bScore = Math.abs(bCenterY - currentCenterY) * 4 + Math.abs(bCenterX - currentCenterX);
            return aScore - bScore;
        });

        setFriendSelection(vertical[0].index);
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

    function getSelectedFriend() {
        const cards = getFriendCards();
        if (!cards.length) return null;
        const selectedCard = cards[selectedFriendIndex];
        if (!selectedCard) return null;
        return getFriends(lastData).find(
            friend => String(friend.id) === String(selectedCard.dataset.friendId || "")
        ) || null;
    }

    function renderFriendPreview(friend) {
        const root = inlineRoot;
        if (!root) return;
        const preview = root.querySelector('[data-friends-role="preview"]');
        if (!preview) return;
        preview.innerHTML = "";

        if (!friend) {
            const empty = document.createElement("div");
            empty.className = "friend-preview-empty";
            empty.textContent = "Select a friend to view their profile.";
            preview.appendChild(empty);
            return;
        }

        const avatar = document.createElement("img");
        avatar.className = "friend-preview-avatar";
        avatar.alt = "";
        avatar.src = friend.avatar || "";
        if (!friend.avatar) avatar.style.display = "none";
        avatar.addEventListener("error", () => { avatar.style.display = "none"; }, { once: true });

        const platform = document.createElement("div");
        platform.className = "friend-preview-platform";
        platform.textContent = platforms[friend.platform]?.label || friend.platform;

        const name = document.createElement("h3");
        name.className = "friend-preview-name";
        name.textContent = friend.name;

        const username = document.createElement("div");
        username.className = "friend-preview-username";
        username.textContent = friend.username ? "@" + friend.username : "Username unavailable";

        const status = document.createElement("div");
        status.className = "friend-preview-status";
        status.textContent = friend.presenceAvailable
            ? statusLabel(friend.status)
            : "Presence unavailable through the current Discord connection";

        const meta = document.createElement("div");
        meta.className = "friend-preview-meta";
        const relationship = document.createElement("span");
        relationship.textContent = relationshipLabel(friend.relationshipType);
        const id = document.createElement("span");
        id.textContent = "ID " + friend.id;
        meta.append(relationship, id);
        preview.append(avatar, platform, name, username, status, meta);

        if (friend.activity) {
            const activity = document.createElement("div");
            activity.className = "friend-preview-activity";
            const activityTitle = document.createElement("span");
            activityTitle.textContent = "Currently playing";
            const activityName = document.createElement("strong");
            activityName.textContent = friend.activity.name;
            activity.append(activityTitle, activityName);
            preview.appendChild(activity);
        }

        const actions = document.createElement("div");
        actions.className = "friend-preview-actions";
        if (friend.platform === "discord") {
            const send = document.createElement("button");
            send.type = "button";
            send.className = "friend-preview-action";
            send.textContent = "Send Message";
            send.addEventListener("click", () => openMessageComposer(friend));
            actions.appendChild(send);
        } else {
            const unavailable = document.createElement("span");
            unavailable.className = "friend-preview-action-note";
            unavailable.textContent = "Platform actions will be added in a later phase.";
            actions.appendChild(unavailable);
        }
        preview.appendChild(actions);
    }

    let messageComposer = null;
    let messageRecipient = null;

    function ensureMessageComposer() {
        if (messageComposer) return messageComposer;

        messageComposer = document.createElement("div");
        messageComposer.id = "friends-message-composer";
        messageComposer.innerHTML = [
            '<section class="friends-message-panel" role="dialog" aria-modal="true" aria-labelledby="friends-message-title">',
            '<div class="friends-message-kicker">DISCORD</div>',
            '<h2 id="friends-message-title">Send Message</h2>',
            '<p data-message-role="recipient"></p>',
            '<textarea data-message-role="input" maxlength="2000" rows="5" placeholder="Write a message..."></textarea>',
            '<div data-message-role="status" class="friends-message-status"></div>',
            '<div class="friends-message-actions">',
            '<button type="button" data-message-role="cancel">Cancel</button>',
            '<button type="button" data-message-role="send">Send</button>',
            '</div>',
            '</section>'
        ].join("");

        document.body.appendChild(messageComposer);
        messageComposer.querySelector('[data-message-role="cancel"]').addEventListener("click", closeMessageComposer);
        messageComposer.querySelector('[data-message-role="send"]').addEventListener("click", sendMessage);
        messageComposer.addEventListener("click", event => {
            if (event.target === messageComposer) closeMessageComposer();
        });
        return messageComposer;
    }

    function openMessageComposer(friend) {
        if (!friend || friend.platform !== "discord") return;
        messageRecipient = friend;
        const composer = ensureMessageComposer();
        composer.querySelector('[data-message-role="recipient"]').textContent = "To " + friend.name;
        composer.querySelector('[data-message-role="input"]').value = "";
        composer.querySelector('[data-message-role="status"]').textContent = "";
        composer.classList.add("visible");
        window.setTimeout(() => composer.querySelector('[data-message-role="input"]').focus(), 0);
    }

    function closeMessageComposer() {
        if (!messageComposer) return;
        messageComposer.classList.remove("visible");
        messageRecipient = null;
    }

    async function sendMessage() {
        if (!messageRecipient) return;
        const composer = ensureMessageComposer();
        const input = composer.querySelector('[data-message-role="input"]');
        const status = composer.querySelector('[data-message-role="status"]');
        const send = composer.querySelector('[data-message-role="send"]');
        const content = input.value.trim();

        if (!content) {
            status.textContent = "Enter a message first.";
            input.focus();
            return;
        }

        send.disabled = true;
        status.textContent = "Sending...";

        try {
            const result = await window.electron?.discordSendMessage?.(messageRecipient.id, content);
            if (!result?.success) throw new Error(result?.error || "Unable to send Discord message.");
            status.textContent = "Message sent.";
            input.value = "";
            window.xmbAudio?.select?.();
            window.setTimeout(() => closeMessageComposer(), 550);
        } catch (error) {
            console.error("Discord message send failed:", error);
            status.textContent = error?.message || "Unable to send message.";
        } finally {
            send.disabled = false;
        }
    }

    function movePlatform(direction) {
        const buttons = getPlatformButtons();
        if (!buttons.length) return false;
        inputFocus = "platforms";
        const current = Math.max(0, buttons.findIndex(button => button.classList.contains("active")));
        const next = (current + direction + buttons.length) % buttons.length;
        buttons[next].click();
        focusPlatforms();
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
        if (!isInlineActive()) return;

        if (event.key === "Escape" && messageComposer?.classList.contains("visible")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeMessageComposer();
            return;
        }

        if (event.key === "Enter" && !event.repeat && inputFocus === "friends") {
            const friend = getSelectedFriend();

            if (friend?.platform === "discord") {
                event.preventDefault();
                event.stopImmediatePropagation();
                openMessageComposer(friend);
            }
        }
    }, true);

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
