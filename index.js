// --- START OF index1.js with Detailed Logging ---
import { extension_settings, loadExtensionSettings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders } from "../../../../script.js"; // <-- Added getRequestHeaders

const extensionName = "hide-helper";
const defaultSettings = {
    // 保留全局默认设置用于向后兼容
    enabled: true
};

// 缓存上下文
let cachedContext = null;

// DOM元素缓存
const domCache = {
    hideLastNInput: null,
    saveBtn: null,
    currentValueDisplay: null,
    // 初始化缓存
    init() {
        this.hideLastNInput = document.getElementById('hide-last-n');
        this.saveBtn = document.getElementById('hide-save-settings-btn');
        this.currentValueDisplay = document.getElementById('hide-current-value');
        // console.log(`[${extensionName}] DOM Cache Initialized`); // 初始日志
    }
};

// 获取优化的上下文
function getContextOptimized() {
    if (!cachedContext) {
        console.log(`[${extensionName}] Context cache miss. Fetching new context.`); // 上下文日志
        cachedContext = getContext();
    }
    // else { console.log(`[${extensionName}] Context cache hit.`); } // 可选的命中日志
    return cachedContext;
}

// 初始化扩展设置 (仅包含全局启用状态)
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0 || typeof extension_settings[extensionName].enabled === 'undefined') {
        extension_settings[extensionName].enabled = defaultSettings.enabled;
    }
    console.log(`[${extensionName}] Settings Loaded. Enabled: ${extension_settings[extensionName].enabled}`); // 设置加载日志
}

// 创建UI面板 - 修改为简化版本，只有开启/关闭选项
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
                    <!-- 开启/关闭选项 -->
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

    // 将UI添加到SillyTavern扩展设置区域
    $("#extensions_settings").append(settingsHtml);
    console.log(`[${extensionName}] Settings UI Panel Created.`); // UI日志

    // 创建聊天输入区旁边的按钮
    createInputWandButton();

    // 创建弹出对话框
    createPopup();

    // 设置事件监听器
    setupEventListeners();

    // 初始化DOM缓存
    // 增加延迟确保 DOM 完全加载
    setTimeout(() => {
        console.log(`[${extensionName}] Initializing DOM Cache after delay.`);
        domCache.init();
    } , 500); // 稍微增加延迟
}

// 新增：创建输入区旁的按钮
function createInputWandButton() {
    const buttonHtml = `
    <div id="hide-helper-wand-button" class="list-group-item flex-container flexGap5" title="隐藏助手">
        <span style="padding-top: 2px;">
            <i class="fa-solid fa-ghost"></i>
        </span>
        <span>隐藏助手</span>
    </div>`;

    $('#data_bank_wand_container').append(buttonHtml);
    console.log(`[${extensionName}] Input Wand Button Created.`); // UI日志
}

// 新增：创建弹出对话框
function createPopup() {
    const popupHtml = `
    <div id="hide-helper-popup" class="hide-helper-popup">
        <div class="hide-helper-popup-title">隐藏助手设置</div>

        <!-- 输入行 - 保存设置按钮 + 输入框 + 取消隐藏按钮 -->
        <div class="hide-helper-input-row">
            <button id="hide-save-settings-btn" class="hide-helper-btn">保存设置</button>
            <input type="number" id="hide-last-n" min="0" placeholder="隐藏最近N楼之前的消息">
            <button id="hide-unhide-all-btn" class="hide-helper-btn">取消隐藏</button>
        </div>

        <!-- 当前隐藏设置 -->
        <div class="hide-helper-current">
            <strong>当前隐藏设置:</strong> <span id="hide-current-value">无</span>
        </div>

        <!-- 底部关闭按钮 -->
        <div class="hide-helper-popup-footer">
            <button id="hide-helper-popup-close" class="hide-helper-close-btn">关闭</button>
        </div>
    </div>`;

    $('body').append(popupHtml);
    console.log(`[${extensionName}] Popup Dialog Created.`); // UI日志
}

// 获取当前角色/群组的隐藏设置 (从角色/群组数据读取)
function getCurrentHideSettings() {
    const context = getContextOptimized();
    if (!context) {
        console.warn(`[${extensionName}] getCurrentHideSettings: Context not available.`);
        return null;
    }

    const isGroup = !!context.groupId;
    let target = null;
    let settingsSource = 'Unknown'; // 用于日志

    if (isGroup) {
        target = context.groups?.find(x => x.id == context.groupId);
        if (target) {
            settingsSource = `Group ${context.groupId}`;
            return target?.data?.hideHelperSettings || null;
        } else {
            console.warn(`[${extensionName}] getCurrentHideSettings: Group ${context.groupId} not found.`);
            return null;
        }
    } else {
        if (context.characters && context.characterId !== undefined && context.characterId < context.characters.length) {
           target = context.characters[context.characterId];
           if (target) {
               settingsSource = `Character ${target.avatar || context.characterId}`;
               return target?.data?.extensions?.hideHelperSettings || null;
           } else {
                console.warn(`[${extensionName}] getCurrentHideSettings: Character at index ${context.characterId} is invalid.`);
                return null;
           }
        } else {
            console.warn(`[${extensionName}] getCurrentHideSettings: Character context is invalid (characterId: ${context.characterId}, characters array: ${!!context.characters})`);
            return null;
        }
    }
    // console.log(`[${extensionName}] Retrieved settings from ${settingsSource}:`, settings || 'null'); // 获取设置日志
    // return settings; // <-- 这个 return 被放到了 if/else 内部
}


// 保存当前角色/群组的隐藏设置 (通过API持久化)
async function saveCurrentHideSettings(hideLastN) {
    const context = getContextOptimized();
    if (!context) {
        console.error(`[${extensionName}] Cannot save settings: Context not available.`);
        return false;
    }
    const isGroup = !!context.groupId;
    // 注意：在这里获取 chatLength 可能不是最新的，如果在保存前有其他操作修改了 chat。
    // 最好是从当前的 context 中动态获取。
    const currentChatLength = getContextOptimized()?.chat?.length || 0; // 实时获取长度

    const settingsToSave = {
        hideLastN: hideLastN >= 0 ? hideLastN : 0, // 确保非负
        lastProcessedLength: currentChatLength,     // 使用实时长度
        userConfigured: true
    };

    console.log(`[${extensionName}] Preparing to save settings:`, settingsToSave); // 保存准备日志

    if (isGroup) {
        const groupId = context.groupId;
        const group = context.groups?.find(x => x.id == groupId);
        if (!group) {
             console.error(`[${extensionName}] Cannot save settings: Group ${groupId} not found in context.`);
             return false;
        }

        // 1. (可选) 修改内存对象 (用于即时反馈, 但API保存才是关键)
        group.data = group.data || {};
        group.data.hideHelperSettings = { ...settingsToSave }; // 使用副本避免后续意外修改
        console.log(`[${extensionName}] Updated group object in memory (Group ID: ${groupId}).`);

        // 2. 持久化 (发送API请求)
        try {
             const payload = {
                 ...group,
                 data: {
                     ...(group.data || {}),
                     hideHelperSettings: { ...settingsToSave } // 确保发送的是当前要保存的值
                 }
             };

            console.log(`[${extensionName}] Sending API request to save group settings for ${groupId}. Payload:`, JSON.stringify(payload)); // API请求日志
            const response = await fetch('/api/groups/edit', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${extensionName}] API Error saving group settings for ${groupId}: ${response.status} ${errorText}`); // API错误日志
                toastr.error(`保存群组设置失败: ${errorText}`);
                return false;
            }
            console.log(`[${extensionName}] API Success: Group settings saved successfully for ${groupId}`); // API成功日志
            return true;
        } catch (error) {
            console.error(`[${extensionName}] Fetch Error saving group settings for ${groupId}:`, error); // Fetch错误日志
            toastr.error(`保存群组设置时发生网络错误: ${error.message}`);
            return false;
        }

    } else { // 是角色
        if (!context.characters || context.characterId === undefined || context.characterId >= context.characters.length) {
             console.error(`[${extensionName}] Cannot save settings: Character context is invalid.`);
             return false;
        }
        const characterId = context.characterId;
        const character = context.characters[characterId];
        if (!character || !character.avatar) {
            console.error(`[${extensionName}] Cannot save settings: Character or character avatar not found at index ${characterId}.`);
            return false;
        }
        const avatarFileName = character.avatar;

        // 1. (可选) 修改内存对象
        character.data = character.data || {};
        character.data.extensions = character.data.extensions || {};
        character.data.extensions.hideHelperSettings = { ...settingsToSave }; // 使用副本
        console.log(`[${extensionName}] Updated character object in memory (Avatar: ${avatarFileName}).`);

        // 2. 持久化 (调用 /api/characters/merge-attributes)
        try {
            const payload = {
                avatar: avatarFileName,
                data: {
                    extensions: {
                        hideHelperSettings: { ...settingsToSave } // 确保发送的是当前要保存的值
                    }
                }
            };

            console.log(`[${extensionName}] Sending API request to save character settings for ${avatarFileName}. Payload:`, JSON.stringify(payload)); // API请求日志
            const response = await fetch('/api/characters/merge-attributes', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${extensionName}] API Error saving character settings for ${avatarFileName}: ${response.status} ${errorText}`); // API错误日志
                toastr.error(`保存角色设置失败: ${errorText}`);
                return false;
            }
            console.log(`[${extensionName}] API Success: Character settings saved successfully for ${avatarFileName}`); // API成功日志
            return true;
        } catch (error) {
            console.error(`[${extensionName}] Fetch Error saving character settings for ${avatarFileName}:`, error); // Fetch错误日志
            toastr.error(`保存角色设置时发生网络错误: ${error.message}`);
            return false;
        }
    }
}

// 更新当前设置显示 - 优化使用DOM缓存
function updateCurrentHideSettingsDisplay() {
    const currentSettings = getCurrentHideSettings();
    // console.log(`[${extensionName}] Updating display. Current settings:`, currentSettings); // 显示更新日志

    if (!domCache.currentValueDisplay) {
        console.warn(`[${extensionName}] updateCurrentHideSettingsDisplay called before DOM cache init.`);
        domCache.init();
        if (!domCache.currentValueDisplay) {
             console.error(`[${extensionName}] DOM cache init failed.`);
             return; // 如果初始化后仍然没有，则退出
        }
    }

    if (currentSettings && currentSettings.hideLastN > 0) {
        domCache.currentValueDisplay.textContent = currentSettings.hideLastN;
    } else {
        domCache.currentValueDisplay.textContent = '无';
    }

    if (domCache.hideLastNInput) {
        domCache.hideLastNInput.value = currentSettings?.hideLastN > 0 ? currentSettings.hideLastN : '';
        // console.log(`[${extensionName}] Set input field value to: '${domCache.hideLastNInput.value}'`); // 输入框更新日志
    } else {
         console.warn(`[${extensionName}] hideLastNInput not found in DOM cache during display update.`);
    }
}

// 防抖函数
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        // console.log(`[${extensionName}] Debounce: Resetting timer for ${fn.name}`); // 防抖日志
        timer = setTimeout(() => {
            // console.log(`[${extensionName}] Debounce: Executing ${fn.name}`); // 防抖执行日志
            fn.apply(this, args)
        }, delay);
    };
}

// 防抖版本的全量检查
const runFullHideCheckDebounced = debounce(runFullHideCheck, 200);

/**
 * 检查是否应该执行隐藏/取消隐藏操作
 * 只有当用户明确设置过隐藏规则并且插件启用时才返回true
 */
function shouldProcessHiding() {
    if (!extension_settings[extensionName].enabled) {
        // console.log(`[${extensionName}] Skipping hide processing: Plugin disabled.`); // 减少控制台噪音
        return false;
    }

    const settings = getCurrentHideSettings();
    if (!settings || settings.userConfigured !== true) {
        // console.log(`[${extensionName}] Skipping hide processing: No user-configured settings found.`); // 减少控制台噪音
        return false;
    }
    // console.log(`[${extensionName}] Should process hiding: Yes. Settings:`, settings); // 确认处理日志
    return true;
}

/**
 * 增量隐藏检查 (用于新消息到达)
 * 仅处理从上次处理长度到现在新增的、需要隐藏的消息
 */
async function runIncrementalHideCheck() {
    // 首先检查是否应该执行隐藏操作
    if (!shouldProcessHiding()) return;

    const startTime = performance.now();
    console.log(`[${extensionName}] ----- Starting Incremental Hide Check -----`);
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`[${extensionName}] Incremental check aborted: Context or chat not available.`);
        return;
    }

    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false }; // 提供默认值
    const { hideLastN, lastProcessedLength = 0 } = settings;

    console.log(`[${extensionName}] Incremental: Current Length=${currentChatLength}, Last Processed=${lastProcessedLength}, HideLastN=${hideLastN}`);

    // --- 前置条件检查 ---
    if (currentChatLength === 0 || hideLastN <= 0) {
        if (currentChatLength !== lastProcessedLength && settings.userConfigured) {
            console.log(`[${extensionName}] Incremental: Chat empty or hideLastN<=0, but length changed (${lastProcessedLength} -> ${currentChatLength}). Updating processed length.`);
            await saveCurrentHideSettings(hideLastN);
        }
        console.log(`[${extensionName}] Incremental check skipped: Chat empty or hideLastN<=0.`);
        return;
    }

    if (currentChatLength <= lastProcessedLength) {
        console.log(`[${extensionName}] Incremental check skipped: Chat length did not increase (${lastProcessedLength} -> ${currentChatLength}). Likely a delete or no change.`);
        // 如果长度减少且用户配置过，这应该由 full check 处理，但这里可以考虑重置 lastProcessedLength
        // if (currentChatLength < lastProcessedLength && settings.userConfigured) {
        //     console.log(`[${extensionName}] Incremental detected length decrease. Forcing full check.`);
        //     runFullHideCheckDebounced.cancel(); // 取消可能存在的防抖
        //     runFullHideCheck();
        // }
        return;
    }

    // --- 计算范围 ---
    const targetVisibleStart = currentChatLength - hideLastN;
    const previousVisibleStart = lastProcessedLength > 0 ? Math.max(0, lastProcessedLength - hideLastN) : 0;

    console.log(`[${extensionName}] Incremental: Target Visible Start=${targetVisibleStart}, Previous Visible Start=${previousVisibleStart}`);

    // --- 收集需要隐藏的消息 ---
    const toHideIncrementally = [];
    const startIndex = previousVisibleStart;
    const endIndex = Math.min(currentChatLength, targetVisibleStart);

    if (endIndex > startIndex) {
        console.log(`[${extensionName}] Incremental: Checking range [${startIndex}, ${endIndex}) for hiding.`);
        for (let i = startIndex; i < endIndex; i++) {
            const message = chat[i]; // 获取消息对象

            // **新增日志：在检查 is_system 之前记录状态**
            if (message) {
                 console.log(`[${extensionName}] Incremental Pre-Check: Message ${i} - is_user: ${!!message.is_user}, is_system: ${message.is_system}`);
            } else {
                 console.warn(`[${extensionName}] Incremental Pre-Check: Message at index ${i} is null or undefined.`);
                 continue; // 如果消息不存在，跳过后续检查
            }

            // 原有的检查逻辑
            if (message.is_system === false) {
                toHideIncrementally.push(i);
                console.log(`[${extensionName}] Incremental: Marked message ${i} (is_user: ${!!message.is_user}) for hiding.`);
            } else if (message.is_system === true) {
                console.log(`[${extensionName}] Incremental: Message ${i} (is_user: ${!!message.is_user}) was already marked as is_system=true when checked.`); // 修改日志，更明确
            }
        }
    } else {
         console.log(`[${extensionName}] Incremental: No new range to check for hiding (start >= end).`);
    }

    // --- 执行批量更新 ---
    if (toHideIncrementally.length > 0) {
        console.log(`[${extensionName}] Incrementally hiding ${toHideIncrementally.length} messages: ${toHideIncrementally.join(', ')}`);

        // 1. 批量更新数据 (chat 数组)
        toHideIncrementally.forEach(idx => { if (chat[idx]) chat[idx].is_system = true; });

        // 2. 批量更新 DOM - 添加详细日志
        try {
            const hideSelector = toHideIncrementally.map(id => `.mes[mesid="${id}"]`).join(',');
            if (hideSelector) {
                const $elementsToHide = $(hideSelector);
                console.log(`[${extensionName}] Incremental DOM Update: Found ${$elementsToHide.length} elements matching selector: ${hideSelector}`);
                if ($elementsToHide.length > 0) {
                    $elementsToHide.attr('is_system', 'true');
                    console.log(`[${extensionName}] Incremental DOM Update: Set is_system=true for ${$elementsToHide.length} elements.`);

                    // **添加诊断日志：在设置属性后立即检查**
                    $elementsToHide.each(function() {
                        const mesId = $(this).attr('mesid');
                        const currentAttr = $(this).attr('is_system');
                        const currentDisplay = $(this).css('display');
                        const isUserMsg = chat[mesId]?.is_user;
                        console.log(`[${extensionName}] Incremental DOM Check (After Set): Message ${mesId} (User: ${isUserMsg}), is_system attribute = '${currentAttr}', display = '${currentDisplay}'`);
                    });

                    // **添加延迟检查 (事件循环后)**
                    setTimeout(() => {
                        console.log(`[${extensionName}] Incremental DOM Check (Delayed): Checking elements again...`);
                        $elementsToHide.each(function() {
                             const mesId = $(this).attr('mesid');
                            const currentAttr = $(this).attr('is_system');
                            const currentDisplay = $(this).css('display');
                            const isUserMsg = chat[mesId]?.is_user;
                            console.log(`[${extensionName}] Incremental DOM Check (Delayed): Message ${mesId} (User: ${isUserMsg}), is_system attribute = '${currentAttr}', display = '${currentDisplay}'`);
                        });
                    }, 50); // 短暂延迟

                } else {
                    console.warn(`[${extensionName}] Incremental DOM Update: Selector '${hideSelector}' found 0 elements.`);
                }
            } else {
                console.log(`[${extensionName}] Incremental DOM Update: No elements to hide.`);
            }
        } catch (error) {
            console.error(`[${extensionName}] Error updating DOM incrementally:`, error);
        }
    } else {
         console.log(`[${extensionName}] Incremental: No new messages needed hiding in range [${startIndex}, ${endIndex}).`);
    }

    // 5. **无论是否隐藏了新消息，只要长度增加了且用户配置过，就更新设置中的 lastProcessedLength**
    if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
        console.log(`[${extensionName}] Incremental: Chat length changed (${lastProcessedLength} -> ${currentChatLength}). Saving updated processed length.`);
        await saveCurrentHideSettings(hideLastN);
    }


    console.log(`[${extensionName}] ----- Incremental Hide Check Completed in ${performance.now() - startTime}ms -----`);
}

/**
 * 全量隐藏检查 (优化的差异更新)
 * 用于加载、切换、删除、设置更改等情况
 */
async function runFullHideCheck() {
    if (!shouldProcessHiding()) return;

    const startTime = performance.now();
    console.log(`[${extensionName}] ***** Starting Full Hide Check *****`);
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`[${extensionName}] Full check aborted: Context or chat not available.`);
        return;
    }
    const chat = context.chat;
    const currentChatLength = chat.length;

    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false };
    const { hideLastN } = settings;

    console.log(`[${extensionName}] Full: Current Length=${currentChatLength}, HideLastN=${hideLastN}`);

    // 1. 计算可见边界
    const visibleStart = hideLastN <= 0 ? 0 : (hideLastN >= currentChatLength ? 0 : currentChatLength - hideLastN);
    console.log(`[${extensionName}] Full: Calculated Visible Start Index = ${visibleStart}`);

    // 2. 差异计算和数据更新阶段
    const toHide = [];
    const toShow = [];
    let dataChanged = false; // 跟踪数据是否实际改变

    for (let i = 0; i < currentChatLength; i++) {
        const msg = chat[i];
        if (!msg) continue;

        const isCurrentlyHidden = msg.is_system === true;
        const shouldBeHidden = i < visibleStart;

        if (shouldBeHidden && !isCurrentlyHidden) {
            msg.is_system = true;
            toHide.push(i);
            dataChanged = true;
            // console.log(`[${extensionName}] Full: Marking message ${i} to hide.`);
        } else if (!shouldBeHidden && isCurrentlyHidden) {
            msg.is_system = false;
            toShow.push(i);
            dataChanged = true;
            // console.log(`[${extensionName}] Full: Marking message ${i} to show.`);
        }
    }

    // 3. 只有在数据有更改时才执行DOM更新
    if (dataChanged) {
        console.log(`[${extensionName}] Full: Data changed. Hiding ${toHide.length}, Showing ${toShow.length}. Applying DOM updates...`);
        try {
            if (toHide.length > 0) {
                const hideSelector = toHide.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) {
                    const $elementsToHide = $(hideSelector);
                    if ($elementsToHide.length > 0) {
                        $elementsToHide.attr('is_system', 'true');
                         // **添加诊断日志**
                        $elementsToHide.each(function() {
                            const mesId = $(this).attr('mesid');
                            console.log(`[${extensionName}] Full DOM Check (After Set Hide): Message ${mesId}, is_system='${$(this).attr('is_system')}', display='${$(this).css('display')}'`);
                        });
                    } else {
                         console.warn(`[${extensionName}] Full DOM Update (Hide): Selector '${hideSelector}' found 0 elements.`);
                    }
                }
            }

            if (toShow.length > 0) {
                const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
                if (showSelector) {
                    const $elementsToShow = $(showSelector);
                     if ($elementsToShow.length > 0) {
                        $elementsToShow.attr('is_system', 'false');
                         // **添加诊断日志**
                        $elementsToShow.each(function() {
                            const mesId = $(this).attr('mesid');
                            console.log(`[${extensionName}] Full DOM Check (After Set Show): Message ${mesId}, is_system='${$(this).attr('is_system')}', display='${$(this).css('display')}'`);
                        });
                    } else {
                         console.warn(`[${extensionName}] Full DOM Update (Show): Selector '${showSelector}' found 0 elements.`);
                    }
                }
            }
        } catch (error) {
            console.error(`[${extensionName}] Error updating DOM in full check:`, error);
        }
    } else {
        console.log(`[${extensionName}] Full: No data changes detected. Skipping DOM updates.`);
    }

    // 4. 更新处理长度并保存设置（如果长度变化且用户已配置）
    // 只有在 full check 是由用户操作（如保存设置、切换聊天）触发时才应该更新长度。
    // 如果是由事件（如删除）触发，其目的是纠正状态，不应视为“处理”了新的长度。
    // 这里暂时注释掉，因为 full check 的触发源不明确，避免错误更新 lastProcessedLength。
    // if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
    //    console.log(`[${extensionName}] Full: Chat length changed (${settings.lastProcessedLength} -> ${currentChatLength}). Saving updated processed length.`);
    //    await saveCurrentHideSettings(hideLastN);
    // }
    // **替代方案**：只在明确的用户操作（如点击保存按钮）后调用 saveCurrentHideSettings。

    console.log(`[${extensionName}] ***** Full Hide Check Completed in ${performance.now() - startTime}ms *****`);
}

// 新增：全部取消隐藏功能
async function unhideAllMessages() {
    const startTime = performance.now();
    console.log(`[${extensionName}] ===== Starting Unhide All =====`);
    const context = getContextOptimized();
    if (!context || !context.chat) {
         console.warn(`[${extensionName}] Unhide all aborted: Chat data not available.`);
         return;
    }
    const chat = context.chat;

    if (chat.length === 0) {
        console.log(`[${extensionName}] Unhide all: Chat is empty. Ensuring setting is 0.`);
         await saveCurrentHideSettings(0); // 确保设置为 0
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
        console.log(`[${extensionName}] Unhide all: Found ${toShow.length} messages to show: ${toShow.join(', ')}`);
        // 更新数据
        toShow.forEach(idx => { if (chat[idx]) chat[idx].is_system = false; });

        // 更新DOM
        try {
            const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
            if (showSelector) {
                 const $elementsToShow = $(showSelector);
                 if ($elementsToShow.length > 0) {
                    $elementsToShow.attr('is_system', 'false');
                    console.log(`[${extensionName}] Unhide all DOM Update: Set is_system=false for ${$elementsToShow.length} elements.`);
                     // **添加诊断日志**
                    $elementsToShow.each(function() {
                        const mesId = $(this).attr('mesid');
                        console.log(`[${extensionName}] Unhide DOM Check (After Set Show): Message ${mesId}, is_system='${$(this).attr('is_system')}', display='${$(this).css('display')}'`);
                    });
                } else {
                     console.warn(`[${extensionName}] Unhide DOM Update: Selector '${showSelector}' found 0 elements.`);
                }
            }
        } catch (error) {
            console.error(`[${extensionName}] Error updating DOM when unhiding all:`, error);
        }

    } else {
        console.log(`[${extensionName}] Unhide all: No hidden messages found.`);
    }

    // 重要修改：重置隐藏设置为0，并通过 API 保存
    console.log(`[${extensionName}] Unhide all: Resetting hideLastN to 0 and saving settings.`);
    const success = await saveCurrentHideSettings(0); // 传入 0
    if (success) {
        console.log(`[${extensionName}] Unhide all: Settings successfully saved with hideLastN=0.`);
        updateCurrentHideSettingsDisplay(); // 只有保存成功才更新显示
    } else {
        toastr.error("无法重置隐藏设置。");
        console.error(`[${extensionName}] Unhide all: Failed to save settings with hideLastN=0.`);
    }
    console.log(`[${extensionName}] ===== Unhide All Completed in ${performance.now() - startTime}ms =====`);
}

// 设置UI元素的事件监听器
function setupEventListeners() {
    console.log(`[${extensionName}] Setting up Event Listeners.`); // 监听器设置日志

    // 设置弹出对话框按钮事件
    $('#hide-helper-wand-button').on('click', function() {
        if (!extension_settings[extensionName].enabled) {
            toastr.warning('隐藏助手当前已禁用，请在扩展设置中启用。');
            console.log(`[${extensionName}] Wand button clicked, but plugin disabled.`); // 按钮点击日志（禁用时）
            return;
        }
        console.log(`[${extensionName}] Wand button clicked. Opening popup.`); // 按钮点击日志（启用时）
        updateCurrentHideSettingsDisplay(); // 打开前更新显示

        const $popup = $('#hide-helper-popup');
        $popup.css({
            'display': 'block',
            'visibility': 'hidden',
            'position': 'fixed',
            'left': '50%',
            'transform': 'translateX(-50%)'
        });

        setTimeout(() => {
            const popupHeight = $popup.outerHeight();
            const windowHeight = $(window).height();
            // 调整 top 位置计算，确保在各种屏幕尺寸下更合理
            const topPosition = Math.max(20, Math.min((windowHeight - popupHeight) * 0.4, windowHeight - popupHeight - 70)); // 更靠近顶部一点，底部留更多空间
            console.log(`[${extensionName}] Calculated popup top: ${topPosition}px (Window: ${windowHeight}, Popup: ${popupHeight})`);
            $popup.css({
                'top': topPosition + 'px',
                'visibility': 'visible'
            });
        }, 0);
    });

    // 弹出框关闭按钮事件
    $('#hide-helper-popup-close').on('click', function() {
        console.log(`[${extensionName}] Popup Close button clicked.`); // 关闭按钮日志
        $('#hide-helper-popup').hide();
    });

    // 设置选项更改事件 (全局启用/禁用)
    $('#hide-helper-toggle').on('change', function() {
        const isEnabled = $(this).val() === 'enabled';
        console.log(`[${extensionName}] Toggle changed. New state: ${isEnabled ? 'Enabled' : 'Disabled'}`); // 开关切换日志
        extension_settings[extensionName].enabled = isEnabled;
        saveSettingsDebounced(); // 保存全局设置

        if (isEnabled) {
            toastr.success('隐藏助手已启用');
            // 启用时，执行一次全量检查来应用当前角色的隐藏状态
            runFullHideCheckDebounced();
        } else {
            toastr.warning('隐藏助手已禁用');
            // 禁用时，可以选择取消所有隐藏，或者保留状态。当前行为是保留。
            // 如果需要禁用时自动取消隐藏，可以在这里调用 unhideAllMessages()
            // console.log(`[${extensionName}] Plugin disabled. Messages will remain hidden/shown based on last state.`);
        }
    });

    const hideLastNInput = document.getElementById('hide-last-n');
    if (hideLastNInput) {
        hideLastNInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (isNaN(value) || value < 0) {
                 e.target.value = '';
            } else {
                 e.target.value = value;
            }
            // console.log(`[${extensionName}] Input value changed: ${e.target.value}`); // 输入变化日志
        });
    } else {
         console.error(`[${extensionName}] Could not find input element #hide-last-n.`);
    }

    // 优化后的保存设置按钮处理
    $('#hide-save-settings-btn').on('click', async function() {
        console.log(`[${extensionName}] Save Settings button clicked.`); // 保存按钮日志
        if (!domCache.hideLastNInput) { // 确保 DOM 缓存已初始化
             console.error(`[${extensionName}] Save aborted: hideLastNInput not in DOM cache.`);
             domCache.init(); // 尝试再次初始化
             if (!domCache.hideLastNInput) return;
        }

        const valueStr = domCache.hideLastNInput.value; // 从缓存读取
        const value = parseInt(valueStr);
        const valueToSave = isNaN(value) || value < 0 ? 0 : value;
        console.log(`[${extensionName}] Value to save: ${valueToSave} (Raw input: '${valueStr}')`);

        const currentSettings = getCurrentHideSettings();
        const currentValue = currentSettings?.hideLastN || 0;
        console.log(`[${extensionName}] Current saved value: ${currentValue}`);

        if (valueToSave !== currentValue) {
            const $btn = $(this);
            const originalText = $btn.text();
            console.log(`[${extensionName}] Saving new value ${valueToSave}. Disabling button.`);
            $btn.text('保存中...').prop('disabled', true);

            const success = await saveCurrentHideSettings(valueToSave);

            if (success) {
                console.log(`[${extensionName}] Settings saved successfully. Running full check.`);
                runFullHideCheck(); // 保存成功后立即执行全量检查
                updateCurrentHideSettingsDisplay();
                toastr.success('隐藏设置已保存');
            } else {
                 console.error(`[${extensionName}] Failed to save settings via API.`);
                 // 错误消息已在 saveCurrentHideSettings 中处理
            }

            console.log(`[${extensionName}] Restoring save button state.`);
            $btn.text(originalText).prop('disabled', false);
        } else {
            console.log(`[${extensionName}] Save Settings: Value (${valueToSave}) hasn't changed. No action needed.`);
            toastr.info('设置未更改');
        }
    });

    // 全部取消隐藏按钮 (现在是 async)
    $('#hide-unhide-all-btn').on('click', async function() {
        console.log(`[${extensionName}] Unhide All button clicked.`); // 取消隐藏按钮日志
        await unhideAllMessages();
    });

    // --- Event Listeners ---
    console.log(`[${extensionName}] Attaching event listeners for SillyTavern events.`);

    // 聊天切换事件
    eventSource.on(event_types.CHAT_CHANGED, () => {
        console.log(`[${extensionName}] Event received: ${event_types.CHAT_CHANGED}`); // 事件日志
        cachedContext = null; // 清除上下文缓存

        // 更新全局启用/禁用状态显示
        const toggleSelect = document.getElementById('hide-helper-toggle');
        if (toggleSelect) {
             toggleSelect.value = extension_settings[extensionName].enabled ? 'enabled' : 'disabled';
        } else {
            console.warn(`[${extensionName}] Could not find #hide-helper-toggle on chat change.`);
        }

        updateCurrentHideSettingsDisplay(); // 更新当前角色设置

        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] Chat changed & plugin enabled. Running full check.`);
            runFullHideCheckDebounced(); // 使用防抖
        } else {
             console.log(`[${extensionName}] Chat changed, but plugin disabled. Skipping check.`);
        }
    });

    // 新消息事件处理 (合并发送和接收)
    const handleNewMessage = (eventType, messageId) => {
         console.log(`[${extensionName}] Event received: ${eventType} (Message ID: ${messageId})`); // 事件日志
        if (extension_settings[extensionName].enabled) {
            // 增加延迟以确保 DOM 更新完成
            const delay = eventType === event_types.MESSAGE_RECEIVED ? 100 : 50; // AI 消息可能需要更长延迟
            console.log(`[${extensionName}] New message & plugin enabled. Running incremental check with ${delay}ms delay.`);
            setTimeout(() => runIncrementalHideCheck(), delay);
        } else {
             console.log(`[${extensionName}] New message, but plugin disabled. Skipping check.`);
        }
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => handleNewMessage(event_types.MESSAGE_RECEIVED, messageId));
    eventSource.on(event_types.MESSAGE_SENT, (messageId) => handleNewMessage(event_types.MESSAGE_SENT, messageId));


    // 消息删除事件
    eventSource.on(event_types.MESSAGE_DELETED, (deletedCount) => { // 参数可能是删除的数量或最后一个消息ID，这里用 deletedCount 占位
        console.log(`[${extensionName}] Event received: ${event_types.MESSAGE_DELETED} (Payload: ${deletedCount})`); // 事件日志
        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] Message deleted & plugin enabled. Running full check.`);
            runFullHideCheckDebounced(); // 删除后运行全量检查
        } else {
             console.log(`[${extensionName}] Message deleted, but plugin disabled. Skipping check.`);
        }
    });

    // 流式响应结束事件 (现在已弃用 CHARACTER_MESSAGE_RENDERED，改用 STREAM_END?)
    // 注意：SillyTavern 的事件名可能随版本变化，确认最新的事件名
    // eventSource.on(event_types.STREAM_END, () => { // 假设有 STREAM_END 事件
    //     console.log(`[${extensionName}] Event received: STREAM_END`); // 事件日志
    //     if (extension_settings[extensionName].enabled) {
    //         console.log(`[${extensionName}] Stream ended & plugin enabled. Running full check.`);
    //         runFullHideCheckDebounced(); // 流结束后运行全量检查更保险
    //     } else {
    //          console.log(`[${extensionName}] Stream ended, but plugin disabled. Skipping check.`);
    //     }
    // });
    // 替代方案：监听 CHARACTER_MESSAGE_RENDERED，但这可能在流结束前触发多次
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        // 这个事件可能过于频繁，只在必要时运行检查，或者只在流结束后运行一次（需要额外逻辑判断流状态）
        // 简单的处理方式：仍然调用增量检查，因为它相对轻量
         if (extension_settings[extensionName].enabled) {
             // console.log(`[${extensionName}] Event received: ${event_types.CHARACTER_MESSAGE_RENDERED} (Message ID: ${messageId}). Running incremental check.`);
             setTimeout(() => runIncrementalHideCheck(), 100); // 增加延迟
        }
    });

    console.log(`[${extensionName}] Event Listeners Setup Complete.`);
}

// 初始化扩展
jQuery(async () => {
    console.log(`[${extensionName}] Initializing extension...`); // 初始化开始日志
    loadSettings(); // 加载全局启用状态
    createUI(); // 创建界面元素

    // 初始加载时更新显示并执行检查
    setTimeout(() => {
        console.log(`[${extensionName}] Running initial setup after delay...`);
        const toggleSelect = document.getElementById('hide-helper-toggle');
        if (toggleSelect) {
            toggleSelect.value = extension_settings[extensionName].enabled ? 'enabled' : 'disabled';
        }

        updateCurrentHideSettingsDisplay(); // 更新当前角色显示

        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] Initial load & plugin enabled. Running initial full check if configured.`);
            // 只有当用户明确配置过后才执行初始检查
            const initialSettings = getCurrentHideSettings();
            if (initialSettings?.userConfigured === true) {
                console.log(`[${extensionName}] User has configured settings. Running initial full check.`);
                runFullHideCheck();
            } else {
                 console.log(`[${extensionName}] User has not configured settings yet. Skipping initial full check.`);
            }
        } else {
            console.log(`[${extensionName}] Initial load, but plugin disabled. Skipping initial check.`);
        }
         console.log(`[${extensionName}] Initial setup complete.`); // 初始化完成日志
    }, 1500);
});
// --- END OF index1.js with Detailed Logging ---
