// ==UserScript==
// @name         OneKey Speed Control
// @namespace    http://tampermonkey.net/
// @version      2026-01-15
// @description  A script to control video playback speed and navigation keys
// @author       ExistoT01
// @match        http://*/*
// @match        https://*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @license MIT
// ==/UserScript==

(function() {
    'use strict';

    const logPrefix = "[OKSC]: "; //日志前缀
    
    const SPEED_STORE_KEY = "OKSC:lastPlaybackRate:" + location.hostname; //记忆页面播放速度

    const TIME_UNIT = 10; //快进，倒带单位(s)
    const RATE_UNIT = 0.25; //调整倍率单位
    const RATE_MAX = 10; //最大播放速率
    const RATE_MIN = 0.25; //最小播放速率
    const LOCKED_SPEED = 3; //倍速播放速度

    const TYPE_CHANGE_SPEED = 1; //类型1，改变视频播放速度
    const TYPE_LOCK_SPEED = 2; //类型2，锁定倍速播放
    const TYPE_CHANGE_PROGRESS_FORWORD = 3; //类型3，快进
    const TYPE_CHANGE_PROGRESS_REWIND = 4; //类型4，倒退
    const TYPE_PLAY = 5;
    const TYPE_PAUSE = 6;

    const MAX_APPLY_ATTEMPTS = 20; //最大尝试注入保存速度次数

    const KEY_INC_SPEED = 'x';
    const KEY_DEC_SPEED = 'z';
    const KEY_LOCK_SPEED = 'u';
    const KEY_REWIND = 'j';
    const KEY_FORWORD = 'l';
    const KEY_PLAY_OR_PAUSE = 'k';

    const MSG_VIDEO_NOT_FOUND = 'video element not found!';

    const HOSTNAME_YOUTUBE = 'www.youtube.com';
    const HOSTNAME_DISNEYPLUS = 'www.disneyplus.com';

    const VIDEO_SELECTOR = 'video';
    const VIDEO_SELECTOR_DISNEYPLUS = '#hivePlayer';

    let originalSpeed = 1;
    let isSpeedLocked = false;
    let timeoutId;
    let applyAttempts = 0;
    let applySavedRateTimer = null;
    let lastUrl = location.href;


    // Your code here...
    document.addEventListener('keydown', function(event) {
        // console.log(logPrefix, 'keydown', event.key);

        if (isTypingTarget(event.target) || isSpeedLocked) {
            return;
        }

        let video = getVideo();
        if (!video) return;

        // Increase speed
        if (event.key === KEY_INC_SPEED) {
            video.playbackRate = Math.min(video.playbackRate + RATE_UNIT, RATE_MAX);
            saveRate(video.playbackRate);
            showNotification(TYPE_CHANGE_SPEED, video.playbackRate);
            return;
        }

        // Decrease speed
        else if (event.key === KEY_DEC_SPEED) {
            video.playbackRate = Math.max(video.playbackRate - RATE_UNIT, RATE_MIN);
            saveRate(video.playbackRate);
            showNotification(TYPE_CHANGE_SPEED, video.playbackRate);
            return;
        }

        // Lock speed
        else if (event.key === KEY_LOCK_SPEED) {
            isSpeedLocked = true;
            originalSpeed = video.playbackRate;
            video.playbackRate = LOCKED_SPEED;
            clearTimeout(timeoutId);
            showNotification(TYPE_LOCK_SPEED, LOCKED_SPEED);
            return;
        }

        switch (event.key) {
            case KEY_REWIND: // Jump back 10 seconds
                video.currentTime = Math.max(video.currentTime - TIME_UNIT, 0);
                showNotification(TYPE_CHANGE_PROGRESS_REWIND);
                break;
            case KEY_PLAY_OR_PAUSE: // Toggle play/pause
                if (video.paused) {
                    video.play();
                    showNotification(TYPE_PLAY, 0);
                } else {
                    video.pause();
                    showNotification(TYPE_PAUSE, 0);
                }
                break;
            case KEY_FORWORD: // Jump forward 10 seconds
                video.currentTime = Math.min(video.currentTime + TIME_UNIT, video.duration);
                showNotification(TYPE_CHANGE_PROGRESS_FORWORD);
                break;
        }

    });


    document.addEventListener('keyup', function(event) {
        // console.log(logPrefix, 'keyup', event.key);
        if (event.key === KEY_LOCK_SPEED) {
            isSpeedLocked = false;

            let video = getVideo();
            if (!video) return;

            video.playbackRate = originalSpeed;
            notification.style.display = 'none';
            showNotification(TYPE_CHANGE_SPEED, originalSpeed);
        }
    })


    // apply saved playback rate if any
    function applySavedRateIfAny() {
        const rate = loadSavedRate();
        if (rate == null) return true;

        const v = getVideo();
        if (!v) return false;

        if (!isSpeedLocked) {
            v.playbackRate = rate;
            originalSpeed = rate;
            showNotification(TYPE_CHANGE_SPEED, rate);
        }

        return true;
    }

    
    function startApplySavedRateTimer() {
        if (window.top !== window.self) return;

        console.log(logPrefix, 'startApplySavedRateTimer()', location.href);

        // stop earlier timer if exist
        if (applySavedRateTimer) {
            clearInterval(applySavedRateTimer);
            applySavedRateTimer = null;
        }

        applyAttempts = 0;

        // Try to apply saved rate
        applySavedRateTimer = setInterval(() => {
            applyAttempts++;
            if (applyAttempts >= MAX_APPLY_ATTEMPTS || applySavedRateIfAny()) {
                clearInterval(applySavedRateTimer);
                applySavedRateTimer = null;
            }
        }, 1000);
    }


    // CSS for the notification
    var style = document.createElement('style');
    style.type = 'text/css';


    // Use a text node to safely insert CSS rules
    style.appendChild(document.createTextNode(`.speed-notification {
        position: fixed;
        bottom: 50px;
        right: 20px;
        background-color: black;
        color: white;
        padding: 8px;
        border-radius: 4px;
        z-index: 9999999;
        display: none;
    }`));

    document.head.appendChild(style);

    // Create the notification element
    var notification = document.createElement('div');
    notification.className = 'speed-notification';
    document.body.appendChild(notification);


    // Fucntion to detect if element is typing target
    function isTypingTarget(el) {
        if (!el) return false;

        if (el.isContentEditable) return true;

        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        
        return false;
    }


    // Function to load saved playback rate
    function loadSavedRate() {
        const raw = localStorage.getItem(SPEED_STORE_KEY);
        const rate = Number(raw);

        if (!Number.isFinite(rate)) return null;

        return Math.min(Math.max(RATE_MIN, rate), RATE_MAX);
    }


    // Function to save playbackrate
    function saveRate(rate) {
        if (!Number.isFinite(rate)) return;
        localStorage.setItem(SPEED_STORE_KEY, Math.min(Math.max(RATE_MIN, rate), RATE_MAX));
    }


    // Observe the URL change, especially for Bilibili
    function hookUrlChange() {
        const _pushState = history.pushState;
        const _replaceState = history.replaceState;
        
        function check() {
            if (lastUrl === location.href) return;
            lastUrl = location.href;
            startApplySavedRateTimer();
        }
        
        history.pushState = function() {
            const ret = _pushState.apply(this, arguments);
            check();
            return ret;
        };

        history.replaceState = function() {
            const ret = _replaceState.apply(this, arguments);
            check();
            return ret;
        }
        
        window.addEventListener('popstate', check);
    }


    // Function to show notification
    function showNotification(type, speed) {

        if (type === TYPE_LOCK_SPEED) {
            notification.textContent = 'Speed: ' + LOCKED_SPEED + 'x';
            notification.style.display = 'block';
            return;
        }

        if (type === TYPE_CHANGE_SPEED) {
            notification.textContent = 'Speed: ' + speed + 'x';
        } else if (type === TYPE_CHANGE_PROGRESS_FORWORD) {
            notification.textContent = '-->>';
        } else if (type === TYPE_CHANGE_PROGRESS_REWIND) {
            notification.textContent = '<<--';
        } else if (type === TYPE_PLAY) {
            notification.textContent = '  ||  ';
        } else if (type === TYPE_PAUSE) {
            notification.textContent = ' |> ';
        }

        notification.style.display = 'block';

        // Hide the notification after 2 seconds
        clearTimeout(timeoutId);
        timeoutId = setTimeout(function() {
            notification.style.display = 'none';
        }, 2000);

    }


    // Function to check whether video element is usable
    function isUsableVideo(v) {
        if (!v || v.tagName.toLowerCase() !== 'video') return false;

        const rect = v.getBoundingClientRect();

        if (rect.width <= 0 || rect.height <= 0) return false;

        const style = getComputedStyle(v);

        if (style.display === 'none' || style.visibility === 'hidden') return false;

        return true;
    }


    // Function to get video element
    function getVideo() {
        const videos = document.querySelectorAll(VIDEO_SELECTOR)

        for (const v of videos) {
            if (isUsableVideo(v)) return v;
        }

        console.log(logPrefix, MSG_VIDEO_NOT_FOUND);

        return null;
    }

    // skip intro
    function skip_max() {
        let skip_div = document.querySelector('div[data-testid="skip"]');
        let next_div = document.querySelector('div[data-testid="up_next"]')

        if (skip_div && skip_div.style.visibility === 'visible' && skip_div.querySelector('button')) {
            let skip_btn = skip_div.querySelector('button');
            skip_btn.click();
            console.log(logPrefix + "intro skipped! (HBO max)");
        }

        if (next_div && next_div.style.visibility === 'visible' && next_div.querySelector('button')) {
            let next_btn = next_div.querySelector('button');
            next_btn.click();
            console.log(logPrefix + "skip to next episode (HBO max)");
        }
    }

    setInterval(skip_max, 2000);
    hookUrlChange();
    startApplySavedRateTimer();

})();
