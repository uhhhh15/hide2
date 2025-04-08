import { extension_settings, loadExtensionSettings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders } from "../../../../script.js"; // <-- Added getRequestHeaders

const extensionName = "hide-helper";
const defaultSettings = {
    enabled: true
};

let cachedContext = null;

const domCache = {
    hideLastNInput: null,
    saveBtn: null,
    currentValueDisplay: null,
    init() {
        this.hideLastNInput = document.getElementById('hide-last-n');
        this.saveBtn = document.getElementById('hide-save-settings-btn');
        this.currentValueDisplay = document.getElementById('hide-current-value');
    }
};

function getContextOptimized() {
    if (!cachedContext) {
        cachedContext = getContext();
    }
    return cachedContext;
}

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0 || typeof extension_settings[extensionName].enabled === 'undefined') {
        extension_settings[extensionName].enabled = defaultSettings.enabled;
    }
}

function createUI() {
    const settingsHtml = `
    <div id="hide-helper-settings" class="hide-helper-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>隐藏助手</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="hide-helper-section">
                    <div class="hide-helper-toggle-row">
                        <span class="hide-helper-label">插件状态:</span>
                        <select id="hide-helper-toggle">
                            <option value="enabled">开启</option>
                            <option value="disabled">关闭</option>
                        </select>
                    </div>
                </div>
                <hr class="sysHR">
            </div>
        </div>
    </div>`;
    $("#extensions_settings").append(settingsHtml);
    createInputWandButton();
    createPopup();
    setupEventListeners();
    setTimeout(() => domCache.init(), 100);
}

function createInputWandButton() {
    const buttonHtml = `
    <div id="hide-helper-wand-button" class="list-group-item flex-container flexGap5" title="隐藏助手">
        <span style="padding-top: 2px;">
            <i class="fa-solid fa-ghost"></i>
        </span>
        <span>隐藏助手</span>
    </div>`;
    $('#data_bank_wand_container').append(buttonHtml);
}

function createPopup() {
    const popupHtml = `
    <div id="hide-helper-popup" class="hide-helper-popup">
        <div class="hide-helper-popup-title">隐藏助手设置</div>
        <div class="hide-helper-input-row">
            <button id="hide-save-settings-btn" class="hide-helper-btn">保存设置</button>
            <input type="number" id="hide-last-n" min="0" placeholder="隐藏最近N楼之前的消息">
            <button id="hide-unhide-all-btn" class="hide-helper-btn">取消隐藏</button>
        </div>
        <div class="hide-helper-current">
            <strong>当前隐藏设置:</strong> <span id="hide-current-value">无</span>
        </div>
        <div class="hide-helper-popup-footer">
            <button id="hide-helper-popup-close" class="hide-helper-close-btn">关闭</button>
        </div>
    </div>`;
    $('body').append(popupHtml);
}

function getCurrentHideSettings() {
    const context = getContextOptimized();
    if (!context) return null;
    const isGroup = !!context.groupId;
    let target = null;
    if (isGroup) {
        target = context.groups?.find(x => x.id == context.groupId);
        return target?.data?.hideHelperSettings || null;
    } else {
        if (context.characters && context.characterId !== undefined && context.characterId < context.characters.length) {
           target = context.characters[context.characterId];
           return target?.data?.extensions?.hideHelperSettings || null;
        }
    }
    return null;
}

async function saveCurrentHideSettings(hideLastN) {
    const context = getContextOptimized();
    if (!context) {
        console.error(`[${extensionName}] Cannot save settings: Context not available.`);
        return false;
    }
    const isGroup = !!context.groupId;
    const chatLength = context.chat?.length || 0;

    const settingsToSave = {
        hideLastN: hideLastN >= 0 ? hideLastN : 0,
        lastProcessedLength: chatLength,
        userConfigured: true
    };

    console.log(`[${extensionName}] Preparing to save settings:`, settingsToSave); // 添加日志：准备保存

    if (isGroup) {
        const groupId = context.groupId;
        const group = context.groups?.find(x => x.id == groupId);
        if (!group) {
             console.error(`[${extensionName}] Cannot save settings: Group ${groupId} not found.`);
             return false;
        }
        // (可选) 更新内存对象
        group.data = group.data || {};
        group.data.hideHelperSettings = settingsToSave;
        // 持久化
        try {
             const payload = { ...group, data: { ...(group.data || {}), hideHelperSettings: settingsToSave } };
            console.log(`[${extensionName}] Saving group settings for ${groupId}:`, JSON.stringify(payload)); // 添加日志：发送请求
            const response = await fetch('/api/groups/edit', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${extensionName}] Failed to save group settings for ${groupId}: ${response.status} ${errorText}`);
                toastr.error(`保存群组设置失败: ${errorText}`);
                return false;
            }
            console.log(`[${extensionName}] Group settings saved successfully for ${groupId}`); // 添加日志：保存成功
            return true;
        } catch (error) {
            console.error(`[${extensionName}] Error saving group settings for ${groupId}:`, error);
            toastr.error(`保存群组设置时发生网络错误: ${error.message}`);
            return false;
        }
    } else {
        if (!context.characters || context.characterId === undefined || context.characterId >= context.characters.length) {
             console.error(`[${extensionName}] Cannot save settings: Character context invalid.`);
             return false;
        }
        const characterId = context.characterId;
        const character = context.characters[characterId];
        if (!character || !character.avatar) {
            console.error(`[${extensionName}] Cannot save settings: Character or avatar not found at index ${characterId}.`);
            return false;
        }
        const avatarFileName = character.avatar;
        // (可选) 更新内存对象
        character.data = character.data || {};
        character.data.extensions = character.data.extensions || {};
        character.data.extensions.hideHelperSettings = settingsToSave;
        // 持久化
        try {
            const payload = { avatar: avatarFileName, data: { extensions: { hideHelperSettings: settingsToSave } } };
            console.log(`[${extensionName}] Saving character settings for ${avatarFileName}:`, JSON.stringify(payload)); // 添加日志：发送请求
            const response = await fetch('/api/characters/merge-attributes', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${extensionName}] Failed to save character settings for ${avatarFileName}: ${response.status} ${errorText}`);
                toastr.error(`保存角色设置失败: ${errorText}`);
                return false;
            }
            console.log(`[${extensionName}] Character settings saved successfully for ${avatarFileName}`); // 添加日志：保存成功
            return true;
        } catch (error) {
            console.error(`[${extensionName}] Error saving character settings for ${avatarFileName}:`, error);
            toastr.error(`保存角色设置时发生网络错误: ${error.message}`);
            return false;
        }
    }
}

function updateCurrentHideSettingsDisplay() {
    const currentSettings = getCurrentHideSettings();
    if (!domCache.currentValueDisplay) {
        domCache.init();
        if (!domCache.currentValueDisplay) return;
    }
    domCache.currentValueDisplay.textContent = (currentSettings && currentSettings.hideLastN > 0) ? currentSettings.hideLastN : '无';
    if (domCache.hideLastNInput) {
        domCache.hideLastNInput.value = currentSettings?.hideLastN > 0 ? currentSettings.hideLastN : '';
    }
}

function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

const runFullHideCheckDebounced = debounce(runFullHideCheck, 200);

function shouldProcessHiding() {
    if (!extension_settings[extensionName].enabled) {
        // console.log(`[${extensionName}] Skipping: Plugin disabled.`);
        return false;
    }
    const settings = getCurrentHideSettings();
    if (!settings || settings.userConfigured !== true) {
        // console.log(`[${extensionName}] Skipping: No user config.`);
        return false;
    }
    return true;
}

// 添加详细日志到 runIncrementalHideCheck
async function runIncrementalHideCheck() {
    const logPrefix = `[${extensionName} IncrCheck] `; // 日志前缀
    console.log(logPrefix + `Running check...`);

    if (!shouldProcessHiding()) {
        console.log(logPrefix + `Skipped due to shouldProcessHiding() = false`);
        return;
    }

    const startTime = performance.now();
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(logPrefix + `Skipped: Context or chat not available.`);
        return;
    }

    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false };
    const { hideLastN, lastProcessedLength = 0 } = settings;

    console.log(logPrefix + `Current Length: ${currentChatLength}, Last Processed: ${lastProcessedLength}, HideLastN: ${hideLastN}`);

    if (currentChatLength === 0 || hideLastN <= 0) {
        if (currentChatLength > lastProcessedLength && settings.userConfigured) {
            console.log(logPrefix + `Chat empty or hideLastN<=0. Updating lastProcessedLength.`);
            await saveCurrentHideSettings(hideLastN);
        } else {
            console.log(logPrefix + `Skipped: Chat empty or hideLastN<=0.`);
        }
        return;
    }

    if (currentChatLength <= lastProcessedLength) {
        console.log(logPrefix + `Skipped: Length did not increase (${lastProcessedLength} -> ${currentChatLength}).`);
        // 只有当长度确实没有增加，且用户配置过时，才检查是否需要保存（如果lastProcessedLength不同）
        // 但在增量检查中，我们期望长度增加，所以这种情况通常不保存
        return;
    }

    const targetVisibleStart = currentChatLength - hideLastN;
    const previousVisibleStart = lastProcessedLength > 0 ? Math.max(0, lastProcessedLength - hideLastN) : 0;

    console.log(logPrefix + `Target Visible Start: ${targetVisibleStart}, Previous Visible Start: ${previousVisibleStart}`);

    if (targetVisibleStart > previousVisibleStart) {
        const toHideIncrementally = [];
        const startIndex = previousVisibleStart;
        const endIndex = Math.min(currentChatLength, targetVisibleStart);

        console.log(logPrefix + `Checking range [${startIndex}, ${endIndex}) for hiding.`);

        for (let i = startIndex; i < endIndex; i++) {
            if (chat[i] && chat[i].is_system === false) {
                toHideIncrementally.push(i);
                const msgType = chat[i].is_user ? 'User' : 'AI';
                console.log(logPrefix + `Marking message ${i} (${msgType}) for hiding (data).`);
            } else {
                // console.log(logPrefix + `Skipping message ${i}: already hidden or doesn't exist.`);
            }
        }

        if (toHideIncrementally.length > 0) {
            console.log(logPrefix + `Messages to hide (data updated): ${toHideIncrementally.join(', ')}`);
            toHideIncrementally.forEach(idx => { if (chat[idx]) chat[idx].is_system = true; });

            // === DOM 更新和检查 ===
            try {
                const hideSelector = toHideIncrementally.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) {
                    console.log(logPrefix + `Applying DOM update: $(...).attr('is_system', 'true') for IDs: ${toHideIncrementally.join(', ')}`);
                    $(hideSelector).attr('is_system', 'true');

                    // --- 关键日志：立即检查属性 ---
                    toHideIncrementally.forEach(id => {
                        const $element = $(`.mes[mesid="${id}"]`);
                        if ($element.length) {
                            const currentAttr = $element.attr('is_system');
                            console.log(logPrefix + `DOM Check (Immediate) - ID ${id}: is_system attribute = ${currentAttr}`);
                            if (currentAttr !== 'true') {
                                console.warn(logPrefix + `DOM Check (Immediate) - ID ${id}: FAILED to set attribute!`);
                            }
                        } else {
                            console.warn(logPrefix + `DOM Check (Immediate) - ID ${id}: Element not found!`);
                        }
                    });

                    // --- 关键日志：延迟检查属性和样式 ---
                    toHideIncrementally.forEach(id => {
                        setTimeout(() => {
                            const $element = $(`.mes[mesid="${id}"]`);
                            if ($element.length) {
                                const currentAttr = $element.attr('is_system');
                                const currentDisplay = $element.css('display');
                                const isUserMsg = chat[id]?.is_user;
                                const msgType = isUserMsg ? 'User' : 'AI';
                                console.log(logPrefix + `DOM Check (Delayed ${id} - ${msgType}): is_system=${currentAttr}, display=${currentDisplay}`);
                                if (currentAttr !== 'true') {
                                    console.error(logPrefix + `DOM Check (Delayed ${id} - ${msgType}): is_system attribute was RESET or never set!`);
                                }
                                if (currentDisplay !== 'none' && currentAttr === 'true') {
                                    console.error(logPrefix + `DOM Check (Delayed ${id} - ${msgType}): VISUALLY NOT HIDDEN despite is_system='true'! Display is '${currentDisplay}'. Check CSS.`);
                                    // 可以在这里进一步检查 computed styles 或其他可能影响显示的因素
                                    console.log(logPrefix + `Computed Style Display (Delayed ${id} - ${msgType}): ${window.getComputedStyle($element[0]).display}`);
                                    console.log(logPrefix + `Element classes (Delayed ${id} - ${msgType}): ${$element.attr('class')}`);
                                }
                            } else {
                                console.warn(logPrefix + `DOM Check (Delayed ${id}): Element not found!`);
                            }
                        }, 10); // 稍微延迟以观察是否被覆盖
                    });
                }
            } catch (error) {
                console.error(logPrefix + `Error updating DOM:`, error);
            }

            console.log(logPrefix + `Saving settings with updated lastProcessedLength.`);
            await saveCurrentHideSettings(hideLastN);

        } else {
             console.log(logPrefix + `No messages needed hiding in range [${startIndex}, ${endIndex}).`);
             if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
                 console.log(logPrefix + `Saving settings: lastProcessedLength updated.`);
                 await saveCurrentHideSettings(hideLastN);
             }
        }
    } else {
        console.log(logPrefix + `Visible start did not advance. Updating lastProcessedLength if needed.`);
        if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
            console.log(logPrefix + `Saving settings: lastProcessedLength updated.`);
            await saveCurrentHideSettings(hideLastN);
        }
    }

    console.log(logPrefix + `Check completed in ${performance.now() - startTime}ms`);
}

// 全量检查（日志可以类似地添加，但重点是增量）
async function runFullHideCheck() {
    const logPrefix = `[${extensionName} FullCheck] `;
    console.log(logPrefix + "Running check...");

    if (!shouldProcessHiding()) {
        console.log(logPrefix + "Skipped due to shouldProcessHiding() = false");
        return;
    }

    const startTime = performance.now();
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(logPrefix + "Skipped: Context or chat not available.");
        return;
    }
    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false };
    const { hideLastN } = settings;

    console.log(logPrefix + `Current Length: ${currentChatLength}, HideLastN: ${hideLastN}`);

    const visibleStart = hideLastN <= 0 ? 0 : (hideLastN >= currentChatLength ? 0 : currentChatLength - hideLastN);
    console.log(logPrefix + `Calculated Visible Start Index: ${visibleStart}`);

    const toHide = [];
    const toShow = [];
    let changed = false;

    for (let i = 0; i < currentChatLength; i++) {
        const msg = chat[i];
        if (!msg) continue;
        const isCurrentlyHidden = msg.is_system === true;
        const shouldBeHidden = i < visibleStart;

        if (shouldBeHidden && !isCurrentlyHidden) {
            msg.is_system = true;
            toHide.push(i);
            changed = true;
        } else if (!shouldBeHidden && isCurrentlyHidden) {
            msg.is_system = false;
            toShow.push(i);
            changed = true;
        }
    }

    if (changed) {
        console.log(logPrefix + `Changes detected - To Hide: [${toHide.join(', ')}], To Show: [${toShow.join(', ')}]`);
        try {
            if (toHide.length > 0) {
                const hideSelector = toHide.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) {
                    console.log(logPrefix + `Applying DOM hide for IDs: ${toHide.join(', ')}`);
                    $(hideSelector).attr('is_system', 'true');
                }
            }
            if (toShow.length > 0) {
                const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
                if (showSelector) {
                    console.log(logPrefix + `Applying DOM show for IDs: ${toShow.join(', ')}`);
                    $(showSelector).attr('is_system', 'false');
                }
            }
             // 添加延迟检查（可选，但有助于调试）
             [...toHide, ...toShow].forEach(id => {
                 setTimeout(() => {
                     const $element = $(`.mes[mesid="${id}"]`);
                     if ($element.length) {
                         const currentAttr = $element.attr('is_system');
                         const currentDisplay = $element.css('display');
                         const shouldBeHiddenNow = toHide.includes(id);
                         const expectedAttr = shouldBeHiddenNow ? 'true' : 'false';
                         const expectedDisplay = shouldBeHiddenNow ? 'none' : ($element.css('flex-direction') ? 'flex' : 'block'); // 粗略估计
                         console.log(logPrefix + `DOM Check (Delayed Full ${id}): is_system=${currentAttr} (expected ${expectedAttr}), display=${currentDisplay} (expected approx ${expectedDisplay})`);
                         if (currentAttr !== expectedAttr) {
                             console.error(logPrefix + `DOM Check (Delayed Full ${id}): Attribute MISMATCH!`);
                         }
                         if (shouldBeHiddenNow && currentDisplay !== 'none') {
                             console.error(logPrefix + `DOM Check (Delayed Full ${id}): VISUALLY NOT HIDDEN! Display is '${currentDisplay}'.`);
                         } else if (!shouldBeHiddenNow && currentDisplay === 'none') {
                             console.error(logPrefix + `DOM Check (Delayed Full ${id}): VISUALLY HIDDEN WHEN IT SHOULD BE VISIBLE!`);
                         }
                     }
                 }, 10);
             });

        } catch (error) {
            console.error(logPrefix + `Error updating DOM:`, error);
        }
    } else {
        console.log(logPrefix + "No changes detected in message visibility.");
    }

    if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
        console.log(logPrefix + `Saving settings: lastProcessedLength updated.`);
        await saveCurrentHideSettings(hideLastN);
    }

    console.log(logPrefix + `Check completed in ${performance.now() - startTime}ms`);
}


// 全部取消隐藏（日志已足够）
async function unhideAllMessages() {
    const logPrefix = `[${extensionName} UnhideAll] `;
    const startTime = performance.now();
    console.log(logPrefix + `Starting unhide all...`);
    const context = getContextOptimized();
    if (!context || !context.chat) {
         console.warn(logPrefix + `Aborted: Chat data unavailable.`);
         return;
    }
    const chat = context.chat;
    if (chat.length === 0) {
         console.log(logPrefix + `Chat is empty. Resetting settings.`);
         await saveCurrentHideSettings(0); // 重置设置
         updateCurrentHideSettingsDisplay();
         return;
    }

    const toShow = [];
    for (let i = 0; i < chat.length; i++) {
        if (chat[i] && chat[i].is_system === true) {
            toShow.push(i);
        }
    }

    if (toShow.length > 0) {
        console.log(logPrefix + `Messages to show (data updated): ${toShow.join(', ')}`);
        toShow.forEach(idx => { if (chat[idx]) chat[idx].is_system = false; });
        try {
            const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
            if (showSelector) {
                console.log(logPrefix + `Applying DOM show for IDs: ${toShow.join(', ')}`);
                $(showSelector).attr('is_system', 'false');
                // 添加延迟检查
                toShow.forEach(id => {
                    setTimeout(() => {
                         const $element = $(`.mes[mesid="${id}"]`);
                         if ($element.length) {
                            const currentAttr = $element.attr('is_system');
                            const currentDisplay = $element.css('display');
                            console.log(logPrefix + `DOM Check (Delayed Unhide ${id}): is_system=${currentAttr}, display=${currentDisplay}`);
                            if (currentAttr !== 'false') console.error(logPrefix + `DOM Check (Delayed Unhide ${id}): Attribute MISMATCH! Expected 'false'.`);
                            if (currentDisplay === 'none') console.error(logPrefix + `DOM Check (Delayed Unhide ${id}): STILL HIDDEN!`);
                         }
                    }, 10);
                });
            }
        } catch (error) {
            console.error(logPrefix + `Error updating DOM:`, error);
        }
    } else {
        console.log(logPrefix + `No hidden messages found.`);
    }

    console.log(logPrefix + `Resetting and saving hide settings to 0.`);
    const success = await saveCurrentHideSettings(0); // 重置并保存设置
    if (success) {
        updateCurrentHideSettingsDisplay();
        console.log(logPrefix + `Settings reset and saved.`);
    } else {
        toastr.error("无法重置隐藏设置。");
        console.error(logPrefix + `Failed to reset settings.`);
    }
    console.log(logPrefix + `Unhide all completed in ${performance.now() - startTime}ms`);
}

function setupEventListeners() {
    $('#hide-helper-wand-button').on('click', function() {
        if (!extension_settings[extensionName].enabled) {
            toastr.warning('隐藏助手当前已禁用，请在扩展设置中启用。');
            return;
        }
        updateCurrentHideSettingsDisplay();
        const $popup = $('#hide-helper-popup');
        $popup.css({ 'display': 'block', 'visibility': 'hidden', 'position': 'fixed', 'left': '50%', 'transform': 'translateX(-50%)' });
        setTimeout(() => {
            const popupHeight = $popup.outerHeight();
            const windowHeight = $(window).height();
            const topPosition = Math.max(10, Math.min((windowHeight - popupHeight) / 2, windowHeight - popupHeight - 50));
            $popup.css({ 'top': topPosition + 'px', 'visibility': 'visible' });
        }, 0);
    });
    $('#hide-helper-popup-close').on('click', function() { $('#hide-helper-popup').hide(); });
    $('#hide-helper-toggle').on('change', function() {
        const isEnabled = $(this).val() === 'enabled';
        extension_settings[extensionName].enabled = isEnabled;
        saveSettingsDebounced();
        if (isEnabled) {
            toastr.success('隐藏助手已启用');
            runFullHideCheckDebounced(); // 启用时执行检查
        } else {
            toastr.warning('隐藏助手已禁用');
            // 禁用时不自动取消隐藏
        }
    });
    const hideLastNInput = document.getElementById('hide-last-n');
    if (hideLastNInput) {
        hideLastNInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (isNaN(value) || value < 0) e.target.value = ''; else e.target.value = value;
        });
    }
    $('#hide-save-settings-btn').on('click', async function() {
        const value = parseInt(hideLastNInput.value);
        const valueToSave = isNaN(value) || value < 0 ? 0 : value;
        const currentSettings = getCurrentHideSettings();
        const currentValue = currentSettings?.hideLastN || 0;
        if (valueToSave !== currentValue) {
            const $btn = $(this); const originalText = $btn.text(); $btn.text('保存中...').prop('disabled', true);
            const success = await saveCurrentHideSettings(valueToSave);
            if (success) {
                runFullHideCheck(); // 保存成功后执行全量检查
                updateCurrentHideSettingsDisplay();
                toastr.success('隐藏设置已保存');
            }
            $btn.text(originalText).prop('disabled', false);
        } else {
            toastr.info('设置未更改');
        }
    });
    $('#hide-unhide-all-btn').on('click', async function() { await unhideAllMessages(); }); // 改为 async 调用

    // 事件监听器保持不变
    eventSource.on(event_types.CHAT_CHANGED, () => {
        cachedContext = null;
        $('#hide-helper-toggle').val(extension_settings[extensionName].enabled ? 'enabled' : 'disabled');
        updateCurrentHideSettingsDisplay();
        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] Event ${event_types.CHAT_CHANGED} received. Running full check.`);
            runFullHideCheckDebounced(); // 聊天切换用全量检查
        }
    });
    const handleNewMessage = (eventType) => { // 添加 eventType 参数用于日志
        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] Event ${eventType} received. Scheduling incremental check.`);
            // 保持增量检查
            setTimeout(() => runIncrementalHideCheck(), 50);
        }
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, () => handleNewMessage(event_types.MESSAGE_RECEIVED));
    eventSource.on(event_types.MESSAGE_SENT, () => handleNewMessage(event_types.MESSAGE_SENT));
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] Event ${event_types.MESSAGE_DELETED} received. Running full check.`);
            runFullHideCheckDebounced(); // 删除用全量检查
        }
    });
    // 移除 STREAM_END 监听器，因为 MESSAGE_RECEIVED 已经处理了流结束的情况
    // eventSource.on(event_types.STREAM_END, () => { ... });
}

jQuery(async () => {
    loadSettings();
    createUI();
    setTimeout(() => {
        $('#hide-helper-toggle').val(extension_settings[extensionName].enabled ? 'enabled' : 'disabled');
        updateCurrentHideSettingsDisplay();
        if (extension_settings[extensionName].enabled) {
            const settings = getCurrentHideSettings();
            if(settings?.userConfigured === true) { // 只有在用户配置过后才执行初始检查
                 console.log(`[${extensionName}] Initial load: Plugin enabled and configured. Running full check.`);
                 runFullHideCheck();
            } else {
                 console.log(`[${extensionName}] Initial load: Plugin enabled but not configured by user. Skipping initial check.`);
            }
        } else {
             console.log(`[${extensionName}] Initial load: Plugin disabled. Skipping initial check.`);
        }
    }, 1500);
});
