// Debounce function to limit the rate at which a function can fire.
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

class OngekiCalculator {
    // Define constants for calculation thresholds and bonuses
    static MAX_SCORE = 1010000;
    static SCORE_THRESHOLD_SSS_PLUS = 1007500; // SSS+ (Over Damage)
    static SCORE_THRESHOLD_SSS = 1000000;      // SSS
    static SCORE_THRESHOLD_SS = 990000;        // SS
    static SCORE_THRESHOLD_S = 970000;         // S

    static RATE_BONUS_MAX = 2.000;             // Max technical bonus (at 1010000)
    static RATE_BONUS_SSS_PLUS_BASE = 1.750;   // Base technical bonus at SSS+
    static RATE_BONUS_SSS_BASE = 1.250;        // Base technical bonus at SSS
    static RATE_BONUS_SS_BASE = 0.750;         // Base technical bonus at SS
    static RATE_BONUS_S_BASE = 0.000;          // Base technical bonus at S

    static RANK_BONUS_SSS_PLUS = 0.300;        // Rank bonus for SSS+
    static RANK_BONUS_SSS = 0.200;             // Rank bonus for SSS
    static RANK_BONUS_SS = 0.100;              // Rank bonus for SS

    constructor() {
        this._cacheDOMElements();
        this.songList = []; // Array of { internalId, title, artist, isLunatic }
        this.songDetails = {}; // Map of internalId -> { difficultyKey: { constantValue, isConstantUnknown } }
        this.apiUrl = 'https://reiwa.f5.si/ongeki_all.json';
        this.currentSelectedInternalId = null; // e.g., "123_STD" or "456_LUN"
        this.currentOpenSongItem = null; // The DOM element of the currently open accordion item
        this.currentSelectedDifficultyBtn = null; // The DOM element of the selected difficulty button
        this.activeMode = 'score'; // 'score' or 'rate'

        // Debounced handlers
        this.debouncedCalculate = debounce(this.calculate.bind(this), 300);
        this.debouncedPerformSearch = debounce(this._performSearch.bind(this), 250);

        this._initTheme();
        this._loadDataAndInitUI();
    }

    _cacheDOMElements() {
        // Search related
        this.searchInput = document.getElementById('song-search');
        this.searchResultsContainer = document.getElementById('search-results');
        this.loadingIndicator = document.getElementById('loading-indicator');

        // Calculator core & result
        this.calculatorCore = document.getElementById('calculator-core');
        this.resultTextElement = document.getElementById('result-text');

        // Mode switch
        this.modeSwitchContainer = document.querySelector('.mode-switch');

        // Input fields and errors (common for both modes where applicable)
        this.chartInput = document.getElementById('chart');             // Rate -> Score: Chart constant
        this.chartError = document.getElementById('chart-error');
        this.chartInfoSpan = document.getElementById('chart-info');
        this.targetRateInput = document.getElementById('target-rate');  // Rate -> Score: Target rate
        this.rateError = document.getElementById('rate-error');
        this.rateLampBonusSelect = document.getElementById('rate-lamp-bonus');
        this.rateFullBellCheckbox = document.getElementById('rate-fb-bonus');

        this.scoreChartInput = document.getElementById('score-chart');   // Score -> Rate: Chart constant
        this.scoreChartError = document.getElementById('score-chart-error');
        this.scoreChartInfoSpan = document.getElementById('score-chart-info');
        this.scoreInput = document.getElementById('score');              // Score -> Rate: Score
        this.scoreError = document.getElementById('score-error');
        this.scoreLampBonusSelect = document.getElementById('score-lamp-bonus');
        this.scoreFullBellCheckbox = document.getElementById('score-fb-bonus');

        // Collect all relevant input/select/checkbox elements for event listeners
        this.interactiveElements = [
            this.chartInput, this.targetRateInput, this.rateLampBonusSelect, this.rateFullBellCheckbox,
            this.scoreChartInput, this.scoreInput, this.scoreLampBonusSelect, this.scoreFullBellCheckbox
        ];
    }

    // Initialize theme based on system preference or saved setting (if implemented)
    _initTheme() {
        const applyTheme = () => {
            const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
            document.body.dataset.theme = prefersDark ? 'dark' : 'light';
            // Update feather icons for the new theme if needed (though usually SVG handles this)
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        };
        applyTheme();
        // Listen for changes in system theme preference
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }

    // Main initialization function: Load data, then set up UI elements and listeners
    async _loadDataAndInitUI() {
        this.loadingIndicator.style.display = 'block';
        this.calculatorCore.style.display = 'none'; // Hide calculator until data is ready

        try {
            await this._fetchAndProcessData();
            this._initializeSearch();
            this._setupEventListeners();
            this.showResult('譜面を選択または定数を入力してください', 'info'); // Initial message
            this.calculatorCore.style.display = 'block'; // Show calculator
        } catch (error) {
            console.error('Data loading or initialization error:', error);
            this.showResult(`データ読み込みエラー: ${error.message}`, 'error');
            // Keep loading indicator visible if data fails? Or show error prominently?
            // For now, hide loading, show error in result area.
        } finally {
            this.loadingIndicator.style.display = 'none'; // Hide loading indicator
        }
    }

    // Fetch data from the API and process it into usable structures
    async _fetchAndProcessData() {
        const response = await fetch(this.apiUrl);
        if (!response.ok) {
            throw new Error(`API Error ${response.status}`);
        }
        const data = await response.json();

        this.songList = [];
        this.songDetails = {};
        const processedInternalIds = new Set(); // To avoid duplicates if API has weird data

        data.forEach(song => {
            // Basic validation of song data structure
            if (!song.meta || song.meta.is_bonus || !song.data || !song.meta.id || !song.meta.title) {
                return; // Skip bonus tracks or incomplete entries
            }

            const baseId = song.meta.id;
            const title = song.meta.title;
            const artist = song.meta.artist || 'Unknown Artist';
            const hasLunaticDifficulty = song.data.hasOwnProperty('LUN');
            // Check if there are any non-LUNATIC difficulties defined
            const hasStandardDifficulties = Object.keys(song.data).some(key => key !== 'LUN');

            // Process LUNATIC version if it exists
            if (hasLunaticDifficulty) {
                const internalId = `${baseId}_LUN`;
                if (!processedInternalIds.has(internalId)) {
                    this.songList.push({ internalId, title, artist, isLunatic: true });
                    const difficulties = {};
                    const lunaticData = song.data['LUN'];
                    if (lunaticData?.const != null) {
                        difficulties['LUN'] = {
                            constantValue: lunaticData.const,
                            isConstantUnknown: !!lunaticData.is_const_unknown // Convert to boolean
                        };
                    }
                    this.songDetails[internalId] = difficulties;
                    processedInternalIds.add(internalId);
                }
            }

            // Process Standard (non-LUNATIC) versions if they exist
            if (hasStandardDifficulties) {
                const internalId = `${baseId}_STD`;
                if (!processedInternalIds.has(internalId)) {
                    this.songList.push({ internalId, title, artist, isLunatic: false });
                    const difficulties = {};
                    for (const difficultyKey in song.data) {
                        if (difficultyKey !== 'LUN') {
                             const difficultyData = song.data[difficultyKey];
                             if (difficultyData?.const != null) {
                                difficulties[difficultyKey] = {
                                    constantValue: difficultyData.const,
                                    isConstantUnknown: !!difficultyData.is_const_unknown // Convert to boolean
                                };
                            }
                        }
                    }
                     // Only add if there are actual difficulties
                    if (Object.keys(difficulties).length > 0) {
                        this.songDetails[internalId] = difficulties;
                         processedInternalIds.add(internalId);
                    } else {
                         // If no standard difficulties found, remove from list
                         const indexToRemove = this.songList.findIndex(item => item.internalId === internalId);
                         if(indexToRemove > -1) this.songList.splice(indexToRemove, 1);
                    }
                }
            }
        });

        // Sort the song list primarily by title (Japanese collation), then by LUNATIC status
        this.songList.sort((a, b) => {
            const titleCompare = a.title.localeCompare(b.title, 'ja');
            if (titleCompare !== 0) {
                return titleCompare;
            }
            return a.isLunatic - b.isLunatic; // false (0) comes before true (1)
        });

        console.log(`Processed ${this.songList.length} song entries.`);
        // console.log('Song List:', this.songList);
        // console.log('Song Details:', this.songDetails);
    }

    // Set up event listeners for search input
    _initializeSearch() {
        let blurTimeout; // Timeout to prevent immediate closing on blur

        this.searchInput.addEventListener('input', this.debouncedPerformSearch);

        // Use focus/blur to manage search results visibility, allowing clicks within results
        this.searchInput.addEventListener('focus', () => {
            clearTimeout(blurTimeout); // Cancel any pending blur close
            // Show results if there's text or if needed for interaction
             if (this.searchInput.value.trim() && this.searchResultsContainer.children.length > 0) {
                this.searchResultsContainer.style.display = 'block';
             } else if (this.searchInput.value.trim()) {
                 this.debouncedPerformSearch(); // Perform search if focused with text
             }
        });

        this.searchInput.addEventListener('blur', () => {
            // Delay closing to allow clicks on search results
            blurTimeout = setTimeout(() => {
                this.searchResultsContainer.style.display = 'none';
            }, 200); // Adjust delay if needed
        });

         // Prevent blur timeout if clicking within results
        this.searchResultsContainer.addEventListener('mousedown', (event) => {
             clearTimeout(blurTimeout);
             // Handle accordion toggle directly here to avoid event propagation issues
             const songItemElement = event.target.closest('.song-item');
             if (songItemElement && !event.target.closest('.difficulty-btn')) {
                 event.preventDefault(); // Prevent text selection on fast clicks
                 this._toggleDifficultyAccordion(songItemElement);
             }
        });

        // Handle clicks on difficulty buttons within the results
        this.searchResultsContainer.addEventListener('click', (event) => {
            const difficultyButton = event.target.closest('.difficulty-btn');
            if (difficultyButton) {
                 clearTimeout(blurTimeout); // Ensure results don't close
                event.stopPropagation(); // Prevent song item click event
                const internalId = difficultyButton.closest('.song-item')?.dataset.internalId;
                const constantValue = parseFloat(difficultyButton.dataset.const);
                 const isUnknown = difficultyButton.dataset.unknown === 'true'; // Check unknown status

                if (internalId && !isNaN(constantValue)) {
                    this._selectDifficulty(internalId, difficultyButton, constantValue, isUnknown);
                     this.searchResultsContainer.style.display = 'none'; // Close results after selection
                     this.searchInput.value = ''; // Clear search input
                     this.searchInput.blur(); // Remove focus from search input
                }
            }
        });


        // Optional: Close results if clicked outside search area
        document.addEventListener('click', (event) => {
            const isClickInsideSearch = this.searchInput.contains(event.target) || this.searchResultsContainer.contains(event.target);
            if (!isClickInsideSearch && this.searchResultsContainer.style.display !== 'none') {
                this.searchResultsContainer.style.display = 'none';
            }
        });
    }

    // Set up general event listeners for calculator inputs and mode switch
    _setupEventListeners() {
        // Mode Switch Listener
        this.modeSwitchContainer.addEventListener('click', (event) => {
            const targetButton = event.target.closest('.mode-btn');
            if (targetButton && !targetButton.classList.contains('active')) {
                this._handleModeSwitch(targetButton);
            }
        });

        // Input listeners for calculation
        this.interactiveElements.forEach(element => {
            if (element) {
                const eventType = (element.tagName === 'SELECT' || element.type === 'checkbox') ? 'change' : 'input';
                element.addEventListener(eventType, (event) => {
                    // If a chart constant input is manually changed, deselect any song/difficulty
                    if (event.target === this.chartInput || event.target === this.scoreChartInput) {
                        this._handleManualConstantInput(event.target);
                    }
                    this.debouncedCalculate(); // Calculate after any input change (debounced)
                });
                 // Also calculate on 'change' for number inputs (e.g., when focus is lost after typing)
                 // to catch cases where 'input' might not fire (like using arrow keys)
                 if (element.type === 'number') {
                     element.addEventListener('change', this.debouncedCalculate);
                 }
            }
        });
    }

    // Perform search based on input value
    _performSearch() {
        let query = this.searchInput.value.trim().toLowerCase();
        // Normalize full-width numbers and period
        query = query.replace(/[．０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));

        if (!query) {
            this.searchResultsContainer.innerHTML = '';
            this.searchResultsContainer.style.display = 'none';
            return;
        }

        const isConstantQuery = /^\d+(\.\d)?$/.test(query); // Match numbers like 13.7, 14, 15.0

        const results = this.songList.filter(song => {
            // Match title (case-insensitive)
            if (song.title.toLowerCase().includes(query)) {
                return true;
            }
            // Match artist (case-insensitive) - uncomment if desired
            // if (song.artist.toLowerCase().includes(query)) {
            //     return true;
            // }

            // Match constant value (if query looks like a constant)
            if (isConstantQuery && this.songDetails[song.internalId]) {
                for (const key in this.songDetails[song.internalId]) {
                    const detail = this.songDetails[song.internalId][key];
                    // Match against `13.7` or `14.0` etc.
                    if (detail.constantValue.toFixed(1) === query) {
                        return true;
                    }
                }
            }
            return false;
        }).slice(0, 30); // Limit results

        this._displayResults(results);
    }

    // Display search results in the container
    _displayResults(results) {
        this.searchResultsContainer.innerHTML = ''; // Clear previous results

        if (results.length === 0) {
            this.searchResultsContainer.innerHTML = '<div class="search-no-results">該当なし</div>';
            this.searchResultsContainer.style.display = 'block';
            return;
        }

        const fragment = document.createDocumentFragment();
        results.forEach(song => {
            const itemElement = document.createElement('div');
            itemElement.classList.add('song-item');
            itemElement.dataset.internalId = song.internalId;

            const lunaticTag = song.isLunatic ? '<span class="lunatic-tag">(LUNATIC)</span>' : '';
            // Note: Using innerHTML for simplicity here. Be cautious if data could contain malicious scripts.
            // Consider using textContent and creating elements manually for better security if needed.
            itemElement.innerHTML = `
                <div class="song-info">
                    <span class="title">${song.title}${lunaticTag}</span>
                    <span class="artist">${song.artist}</span>
                </div>
                <div class="difficulty-container">
                    <div class="difficulty-buttons"></div>
                </div>
            `;
            fragment.appendChild(itemElement);
        });

        this.searchResultsContainer.appendChild(fragment);
        this.searchResultsContainer.style.display = 'block';
    }

    // Toggle the visibility of the difficulty buttons for a selected song
    _toggleDifficultyAccordion(songItemElement) {
        const isOpen = songItemElement.classList.contains('open');

        // Close previously open item if it exists and is different
        if (this.currentOpenSongItem && this.currentOpenSongItem !== songItemElement) {
            this.currentOpenSongItem.classList.remove('open', 'selected-song');
        }

        // Toggle the current item
        if (isOpen) {
            songItemElement.classList.remove('open', 'selected-song');
            this.currentOpenSongItem = null;
        } else {
            // Populate buttons before opening
            this._populateDifficultyButtons(songItemElement);
            songItemElement.classList.add('open', 'selected-song');
            this.currentOpenSongItem = songItemElement;

             // Scroll the opened item into view if it's partially hidden
             songItemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // Populate the difficulty buttons within a song item's accordion
    _populateDifficultyButtons(songItemElement) {
        const internalId = songItemElement.dataset.internalId;
        const buttonsContainer = songItemElement.querySelector('.difficulty-buttons');

        // Ensure valid ID, container, and that buttons aren't already populated
        if (!internalId || !buttonsContainer || buttonsContainer.children.length > 0) {
            return;
        }

        const difficulties = this.songDetails[internalId];
        buttonsContainer.innerHTML = ''; // Clear placeholder/previous

        if (!difficulties || Object.keys(difficulties).length === 0) {
            buttonsContainer.innerHTML = '<span class="no-difficulty-data">難易度データなし</span>';
            return;
        }

        // Define standard difficulty keys and their display names/classes
        const difficultyMap = { "BAS": "BASIC", "ADV": "ADVANCED", "EXP": "EXPERT", "MAS": "MASTER", "LUN": "LUNATIC" };
        const classNameMap = { "BAS": "basic", "ADV": "advanced", "EXP": "expert", "MAS": "master", "LUN": "lunatic" };
        const order = ["BAS", "ADV", "EXP", "MAS", "LUN"]; // Desired display order

        // Sort available difficulties according to the defined order
        const sortedKeys = Object.keys(difficulties).sort((a, b) => {
            const indexA = order.indexOf(a);
            const indexB = order.indexOf(b);
            // Handle potential unknown keys (place them at the end)
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        const fragment = document.createDocumentFragment();
        sortedKeys.forEach(difficultyKey => {
            const difficultyData = difficulties[difficultyKey];
            const button = document.createElement('button');

            const displayName = difficultyMap[difficultyKey] || difficultyKey; // Fallback to key if not mapped
            const className = classNameMap[difficultyKey]; // Get class suffix

            button.classList.add('difficulty-btn');
            if (className) {
                button.classList.add(`diff-${className}`);
            }

            button.dataset.difficultyKey = difficultyKey;
            button.dataset.const = difficultyData.constantValue.toFixed(1); // Store constant with one decimal
            button.dataset.unknown = difficultyData.isConstantUnknown; // Store unknown status

            let constantText = difficultyData.constantValue.toFixed(1);
            let unknownClass = '';
            if (difficultyData.isConstantUnknown) {
                constantText += '?';
                unknownClass = ' unknown'; // Add class for styling unknown constants
            }

            button.innerHTML = `${displayName} <span class="const-value${unknownClass}">(${constantText})</span>`;
            fragment.appendChild(button);
        });

        buttonsContainer.appendChild(fragment);
    }

    // Handle selecting a difficulty button
    _selectDifficulty(internalId, buttonElement, constantValue, isConstantUnknown) {
        this.currentSelectedInternalId = internalId;

        // Deselect previous button if any
        if (this.currentSelectedDifficultyBtn) {
            this.currentSelectedDifficultyBtn.classList.remove('selected');
        }

        // Select the new button
        buttonElement.classList.add('selected');
        this.currentSelectedDifficultyBtn = buttonElement;

        // Update the constant value in both input fields
        this._setConstantToInputs(constantValue);

        // Update the informational text next to the label
        this._updateChartInfo();

        // Clear any previous input errors
        this._clearErrors();

        // Trigger calculation
        this.calculate(); // Use direct call here, no need for debounce after explicit selection

        // Close the accordion (optional, good UX)
        if (this.currentOpenSongItem) {
            this.currentOpenSongItem.classList.remove('open', 'selected-song');
            this.currentOpenSongItem = null; // Reset open item state
        }
        // Results container is hidden by the click handler in _initializeSearch
    }

    // Handle manual input into either chart constant field
    _handleManualConstantInput(inputElement) {
         // If a difficulty was previously selected, deselect it visually
        if (this.currentSelectedDifficultyBtn) {
            this.currentSelectedDifficultyBtn.classList.remove('selected');
            this.currentSelectedDifficultyBtn = null;
        }
        this.currentSelectedInternalId = null; // No song is selected now

        // Sync the value to the other constant input field
        const targetId = inputElement === this.chartInput ? 'score-chart' : 'chart';
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            targetElement.value = inputElement.value;
        }

        // Update the info span to show manual input state
        this._updateChartInfo();
        // Calculation is triggered by the event listener's debouncedCalculate
    }

    // Clears both chart constant inputs and resets selection state
    _clearConstantInputs() {
        this.chartInput.value = '';
        this.scoreChartInput.value = '';
        // Optionally reset placeholders if needed
        // this.chartInput.placeholder = '譜面選択 or 直接入力 (1.0-15.7)';
        // this.scoreChartInput.placeholder = '譜面選択 or 直接入力 (1.0-15.7)';

        if (this.currentSelectedDifficultyBtn) {
            this.currentSelectedDifficultyBtn.classList.remove('selected');
            this.currentSelectedDifficultyBtn = null;
        }
        this.currentSelectedInternalId = null;
        this._updateChartInfo(); // Clear song info
        this.showResult('譜面を選択または定数を入力してください', 'info'); // Reset result display
    }

    // Sets the constant value to both input fields
    _setConstantToInputs(constant) {
        const constantString = constant.toFixed(1);
        this.chartInput.value = constantString;
        this.scoreChartInput.value = constantString;
         // Update placeholders as well to reflect the selected value
         // this.chartInput.placeholder = constantString;
         // this.scoreChartInput.placeholder = constantString;
    }

    // Update the text spans showing the selected song/difficulty or manual input state
    _updateChartInfo() {
        let infoText = '';
        if (this.currentSelectedInternalId && this.currentSelectedDifficultyBtn) {
            const song = this.songList.find(s => s.internalId === this.currentSelectedInternalId);
            const difficultyKey = this.currentSelectedDifficultyBtn.dataset.difficultyKey;
            const difficultyMap = { "BAS": "BASIC", "ADV": "ADVANCED", "EXP": "EXPERT", "MAS": "MASTER", "LUN": "LUNATIC" };

            if (song && difficultyKey) {
                const difficultyName = difficultyMap[difficultyKey] || difficultyKey;
                 // Handle LUNATIC display - show tag only if not already in title
                let displayTitle = song.title;
                 if (song.isLunatic && !displayTitle.toLowerCase().includes('lunatic')) {
                      displayTitle += ' (LUNATIC)'; // Append if needed
                 } else if (!song.isLunatic && displayTitle.toLowerCase().includes('lunatic')) {
                     // This case shouldn't happen with current data processing, but good practice
                     displayTitle = displayTitle.replace(/\s?\(LUNATIC\)/i, '');
                 }
                infoText = `${displayTitle} [${difficultyName}]`;
            }
        } else if (this.chartInput.value || this.scoreChartInput.value) {
             // Only show "(Manual Input)" if a value exists but no song is selected
             if (this.chartInput.value.trim() !== '' || this.scoreChartInput.value.trim() !== '') {
                infoText = '(手動入力)';
             }
        }
        // Update both info spans
        if (this.chartInfoSpan) this.chartInfoSpan.textContent = infoText;
        if (this.scoreChartInfoSpan) this.scoreChartInfoSpan.textContent = infoText;
    }


    // Switch between 'Score -> Rate' and 'Rate -> Score' modes
    _handleModeSwitch(targetButton) {
        const newMode = targetButton.dataset.mode;
        if (newMode === this.activeMode) return; // Do nothing if already active

        this.activeMode = newMode;

        // Update button active states and ARIA attributes
        this.modeSwitchContainer.querySelectorAll('.mode-btn').forEach(button => {
            const isActive = button === targetButton;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive);
        });

        // Update container attribute for CSS slider animation
        this.modeSwitchContainer.dataset.activeMode = newMode;

        // Show/hide the relevant input groups
        document.querySelectorAll('.input-group').forEach(group => {
            const isGroupForActiveMode = group.classList.contains(`${this.activeMode}-mode`);
             group.style.display = isGroupForActiveMode ? 'block' : 'none';
             // Optional: Add aria-hidden for better accessibility
             group.setAttribute('aria-hidden', !isGroupForActiveMode);
        });

        // Sync constant value between modes if a value exists
        const sourceConstantInput = (this.activeMode === 'rate') ? this.scoreChartInput : this.chartInput;
        const targetConstantInput = (this.activeMode === 'rate') ? this.chartInput : this.scoreChartInput;
        if (targetConstantInput && sourceConstantInput && sourceConstantInput.value) {
            targetConstantInput.value = sourceConstantInput.value;
        }
         // Ensure chart info is also synced
         this._updateChartInfo();


        // Clear errors and recalculate for the new mode
        this._clearErrors();
        this.calculate(); // Calculate immediately for the new mode
    }

    // Clear all validation error messages and invalid states
    _clearErrors() {
        // Clear text content of error message elements
        [this.chartError, this.scoreChartError, this.rateError, this.scoreError].forEach(el => {
            if (el) el.textContent = '';
        });
        // Remove 'invalid' class and aria-invalid attribute from inputs/selects
        [this.chartInput, this.scoreChartInput, this.targetRateInput, this.scoreInput,
         this.rateLampBonusSelect, this.scoreLampBonusSelect // Include selects if they can be invalid
        ].forEach(el => {
            if (el) {
                 el.classList.remove('invalid');
                 el.removeAttribute('aria-invalid');
            }
        });
    }

    // Display the calculation result or status messages
    showResult(content, type = 'success') {
        let iconName = 'check-circle'; // Default icon for success
        if (type === 'error') {
            iconName = 'alert-circle';
        } else if (type === 'info') {
            iconName = 'info';
        }

        // Determine if the content is the main value or just a message
        const contentClass = (type === 'success' && !isNaN(parseFloat(String(content).replace(/,/g, '')))) ? 'value' : 'message';

        this.resultTextElement.className = type; // Set class for styling (info, success, error)
        this.resultTextElement.innerHTML = `<i data-feather="${iconName}"></i> <span class="${contentClass}">${content}</span>`;

        // Re-apply Feather Icons to render the new icon
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    // Main calculation logic triggered by input changes
    calculate() {
        this._clearErrors();
        let isValid = true;
        let chartConstant = NaN;
        let otherValue = NaN; // Either score or target rate
        let lampBonusValue = 0;
        let fullBellBonusValue = 0;

        // Identify elements based on the current active mode
        let constantInput, constantErrorElement, otherInput, otherErrorElement, lampBonusSelect, fullBellCheckbox;

        if (this.activeMode === 'rate') { // Rate -> Score mode
            constantInput = this.chartInput;
            constantErrorElement = this.chartError;
            otherInput = this.targetRateInput;
            otherErrorElement = this.rateError;
            lampBonusSelect = this.rateLampBonusSelect;
            fullBellCheckbox = this.rateFullBellCheckbox;
        } else { // Score -> Rate mode (default)
            constantInput = this.scoreChartInput;
            constantErrorElement = this.scoreChartError;
            otherInput = this.scoreInput;
            otherErrorElement = this.scoreError;
            lampBonusSelect = this.scoreLampBonusSelect;
            fullBellCheckbox = this.scoreFullBellCheckbox;
        }

        // --- Input Validation ---

        // Validate Chart Constant
        const constantString = constantInput.value.trim();
        if (!constantString) {
            isValid = false;
            constantErrorElement.textContent = '譜面定数を入力または選択してください';
            constantInput.classList.add('invalid');
            constantInput.setAttribute('aria-invalid', 'true');
        } else {
            chartConstant = parseFloat(constantString);
            if (isNaN(chartConstant) || chartConstant < 1.0 || chartConstant > 15.7) {
                isValid = false;
                constantErrorElement.textContent = '定数は1.0～15.7の範囲で入力';
                constantInput.classList.add('invalid');
                constantInput.setAttribute('aria-invalid', 'true');
            }
        }

        // Validate Score or Target Rate
        const otherString = otherInput.value.trim();
        const minValue = parseFloat(otherInput.min);
        const maxValue = parseFloat(otherInput.max);
        if (!otherString) {
            isValid = false;
            otherErrorElement.textContent = (this.activeMode === 'rate' ? '目標レート' : 'スコア') + 'を入力してください';
            otherInput.classList.add('invalid');
            otherInput.setAttribute('aria-invalid', 'true');
        } else {
            otherValue = parseFloat(otherString);
            // Add a small tolerance for floating point comparisons if needed
            // const tolerance = 0.0001;
            if (isNaN(otherValue) || otherValue < minValue /*- tolerance*/ || otherValue > maxValue /*+ tolerance*/) {
                isValid = false;
                otherErrorElement.textContent = `${this.activeMode === 'rate' ? 'レート' : 'スコア'}は${minValue}～${maxValue}の範囲で入力`;
                otherInput.classList.add('invalid');
                otherInput.setAttribute('aria-invalid', 'true');
            }
        }

        // If any validation failed, show placeholder message and exit
        if (!isValid) {
            this.showResult('-', 'info'); // Use a simple placeholder
            return;
        }

        // --- Get Bonus Values ---
        try {
            lampBonusValue = parseFloat(lampBonusSelect.value);
            if (isNaN(lampBonusValue)) lampBonusValue = 0; // Default to 0 if parsing fails

            fullBellBonusValue = fullBellCheckbox.checked ? parseFloat(fullBellCheckbox.value) : 0;
             if (isNaN(fullBellBonusValue)) fullBellBonusValue = 0; // Default to 0

            // --- Perform Calculation ---
            let resultValue;
            if (this.activeMode === 'rate') { // Calculate Score from Rate
                resultValue = this._calculateScoreInternal(chartConstant, otherValue, lampBonusValue, fullBellBonusValue);
                 // Check if result is an error message string or a valid score
                 if (typeof resultValue === 'string' && !/^[0-9,]+\s?(\(MAX\))?$/.test(resultValue)) {
                     this.showResult(resultValue, 'error'); // Show calculation error message
                 } else {
                     this.showResult(resultValue, 'success'); // Show calculated score
                 }
            } else { // Calculate Rate from Score
                resultValue = this._calculateRateInternal(chartConstant, otherValue, lampBonusValue, fullBellBonusValue);
                this.showResult(resultValue, 'success'); // Show calculated rate
            }
        } catch (error) {
            console.error("Calculation error:", error);
            this.showResult('計算エラーが発生しました', 'error');
        }
    }

    // Internal method: Calculate Rate from Score and Bonuses
    _calculateRateInternal(chartConstant, score, lampBonus, fullBellBonus) {
        score = Math.floor(score); // Use the floor of the score for calculations

        let technicalBonus = 0;
        let rankBonus = 0;

        // Calculate Technical Bonus based on score ranges
        if (score >= OngekiCalculator.SCORE_THRESHOLD_SSS_PLUS) { // 1007500+
            // Bonus increases by 0.001 for every 10 points above SSS+ threshold
             // Ensure calculation handles the 1010000 MAX case correctly (should yield 2.000)
             if (score >= OngekiCalculator.MAX_SCORE) {
                 technicalBonus = OngekiCalculator.RATE_BONUS_MAX;
             } else {
                 technicalBonus = OngekiCalculator.RATE_BONUS_SSS_PLUS_BASE + Math.floor((score - OngekiCalculator.SCORE_THRESHOLD_SSS_PLUS) / 10) * 0.001;
             }
        } else if (score >= OngekiCalculator.SCORE_THRESHOLD_SSS) { // 1000000 - 1007499
            // Bonus increases by 0.001 for every 15 points above SSS threshold
            technicalBonus = OngekiCalculator.RATE_BONUS_SSS_BASE + Math.floor((score - OngekiCalculator.SCORE_THRESHOLD_SSS) / 15) * 0.001;
        } else if (score >= OngekiCalculator.SCORE_THRESHOLD_SS) { // 990000 - 999999
            // Bonus increases by 0.001 for every 20 points above SS threshold
            technicalBonus = OngekiCalculator.RATE_BONUS_SS_BASE + Math.floor((score - OngekiCalculator.SCORE_THRESHOLD_SS) / 20) * 0.001;
        } else if (score >= OngekiCalculator.SCORE_THRESHOLD_S) { // 970000 - 989999
            // Bonus increases by 0.001 for every (80/3) points ~ 26.67 points above S threshold
            // Use division for more accuracy before flooring
            technicalBonus = OngekiCalculator.RATE_BONUS_S_BASE + Math.floor((score - OngekiCalculator.SCORE_THRESHOLD_S) / (80 / 3)) * 0.001;
        }
        // No technical bonus below S rank (970000)

        // Calculate Rank Bonus based on score thresholds (simpler)
        if (score >= OngekiCalculator.SCORE_THRESHOLD_SSS_PLUS) { // 1007500+
            rankBonus = OngekiCalculator.RANK_BONUS_SSS_PLUS;
        } else if (score >= OngekiCalculator.SCORE_THRESHOLD_SSS) { // 1000000 - 1007499
            rankBonus = OngekiCalculator.RANK_BONUS_SSS;
        } else if (score >= OngekiCalculator.SCORE_THRESHOLD_SS) { // 990000 - 999999
            rankBonus = OngekiCalculator.RANK_BONUS_SS;
        }
        // No rank bonus below SS rank (990000)

        // Ensure bonuses are capped at their theoretical maximums and precision
         technicalBonus = parseFloat(Math.min(technicalBonus, OngekiCalculator.RATE_BONUS_MAX).toFixed(3));
         rankBonus = parseFloat(rankBonus.toFixed(3));
         lampBonus = parseFloat(lampBonus.toFixed(3));
         fullBellBonus = parseFloat(fullBellBonus.toFixed(3));

        // Calculate final rate
        const rateValue = chartConstant + technicalBonus + rankBonus + lampBonus + fullBellBonus;

        // Return rate formatted to 3 decimal places, ensuring non-negative
        return Math.max(0, rateValue).toFixed(3);
    }

    // Internal method: Calculate Score from Target Rate and Bonuses
    _calculateScoreInternal(chartConstant, targetRate, lampBonus, fullBellBonus) {
         // Precision matters here
         targetRate = parseFloat(targetRate.toFixed(3));
         chartConstant = parseFloat(chartConstant.toFixed(3));
         lampBonus = parseFloat(lampBonus.toFixed(3));
         fullBellBonus = parseFloat(fullBellBonus.toFixed(3));

        // Calculate the maximum possible rate for this chart constant and selected bonuses
        const maxPossibleRate = parseFloat((chartConstant + OngekiCalculator.RATE_BONUS_MAX + OngekiCalculator.RANK_BONUS_SSS_PLUS + lampBonus + fullBellBonus).toFixed(3));
        // Calculate the rate achieved with 0 technical/rank bonus (effectively the rate at score < 970000)
        const baseRateWithoutScoreBonuses = parseFloat((chartConstant + lampBonus + fullBellBonus).toFixed(3));


        // Check if target rate is achievable
        if (targetRate > maxPossibleRate) {
            return `レート上限 (${maxPossibleRate.toFixed(3)}) を超えています`;
        }
         // Technically, rate below base is impossible unless chartConstant is negative, but check anyway.
        if (targetRate < baseRateWithoutScoreBonuses) {
             // Consider score 0 or a very low score if the target rate is *exactly* the base rate.
             // However, usually implies needing 0 technical/rank bonus.
             // A safe bet is to indicate the minimum score threshold (S rank) might be needed.
             return `レート下限 (${baseRateWithoutScoreBonuses.toFixed(3)}) 未満です (理論上は ${OngekiCalculator.SCORE_THRESHOLD_S.toLocaleString()} 未満)`;
        }
        // If target rate exactly matches the maximum possible rate, the score is MAX
        if (targetRate === maxPossibleRate) {
            return OngekiCalculator.MAX_SCORE.toLocaleString() + ' (MAX)';
        }

        // Calculate the required combined bonus (Technical + Rank)
         const requiredTotalBonus = parseFloat((targetRate - baseRateWithoutScoreBonuses).toFixed(3));

        let requiredScore = 0;

        // Determine the score range based on the required total bonus
        // We need to compare requiredTotalBonus against the *combined* thresholds of Tech+Rank bonuses.
        // SSS+ : Tech >= 1.750, Rank = 0.300 -> Total >= 2.050 (for score >= 1007500)
        // SSS  : Tech >= 1.250, Rank = 0.200 -> Total >= 1.450 (for score >= 1000000)
        // SS   : Tech >= 0.750, Rank = 0.100 -> Total >= 0.850 (for score >= 990000)
        // S    : Tech >= 0.000, Rank = 0.000 -> Total >= 0.000 (for score >= 970000)

         const combinedBonusThreshold_SSSplus = parseFloat((OngekiCalculator.RATE_BONUS_SSS_PLUS_BASE + OngekiCalculator.RANK_BONUS_SSS_PLUS).toFixed(3)); // ~2.050
         const combinedBonusThreshold_SSS = parseFloat((OngekiCalculator.RATE_BONUS_SSS_BASE + OngekiCalculator.RANK_BONUS_SSS).toFixed(3));     // ~1.450
         const combinedBonusThreshold_SS = parseFloat((OngekiCalculator.RATE_BONUS_SS_BASE + OngekiCalculator.RANK_BONUS_SS).toFixed(3));        // ~0.850
         // Note: Max possible bonus is 2.000 + 0.300 = 2.300

        if (requiredTotalBonus >= combinedBonusThreshold_SSSplus) { // Need score in SSS+ range (1007500+)
            // Calculate required *technical* bonus by subtracting the SSS+ rank bonus
            const requiredTechnicalBonus = Math.max(0, requiredTotalBonus - OngekiCalculator.RANK_BONUS_SSS_PLUS);
             // Invert the SSS+ technical bonus formula: score = threshold + ceil((tech_bonus - base) / 0.001) * 10
            requiredScore = OngekiCalculator.SCORE_THRESHOLD_SSS_PLUS + Math.ceil(Math.max(0, requiredTechnicalBonus - OngekiCalculator.RATE_BONUS_SSS_PLUS_BASE) / 0.001) * 10;
        } else if (requiredTotalBonus >= combinedBonusThreshold_SSS) { // Need score in SSS range (1000000 - 1007499)
            const requiredTechnicalBonus = Math.max(0, requiredTotalBonus - OngekiCalculator.RANK_BONUS_SSS);
             // Invert the SSS technical bonus formula: score = threshold + ceil((tech_bonus - base) / 0.001) * 15
             requiredScore = OngekiCalculator.SCORE_THRESHOLD_SSS + Math.ceil(Math.max(0, requiredTechnicalBonus - OngekiCalculator.RATE_BONUS_SSS_BASE) / 0.001) * 15;
        } else if (requiredTotalBonus >= combinedBonusThreshold_SS) { // Need score in SS range (990000 - 999999)
             const requiredTechnicalBonus = Math.max(0, requiredTotalBonus - OngekiCalculator.RANK_BONUS_SS);
             // Invert the SS technical bonus formula: score = threshold + ceil((tech_bonus - base) / 0.001) * 20
             requiredScore = OngekiCalculator.SCORE_THRESHOLD_SS + Math.ceil(Math.max(0, requiredTechnicalBonus - OngekiCalculator.RATE_BONUS_SS_BASE) / 0.001) * 20;
         } else if (requiredTotalBonus >= 0) { // Need score in S range (970000 - 989999)
             // Rank bonus is 0 here. Required technical bonus is the same as requiredTotalBonus.
             const requiredTechnicalBonus = requiredTotalBonus;
             // Invert the S technical bonus formula: score = threshold + ceil( (tech_bonus - base) / 0.001 * (80/3) )
             // simplified: score = ceil( threshold + tech_bonus / 0.001 * (80/3) )
             // Use Math.ceil on the *increment* part before adding to the base score threshold
             const scoreIncrement = Math.ceil(Math.max(0, requiredTechnicalBonus) / 0.001) * (80 / 3);
             requiredScore = Math.ceil(OngekiCalculator.SCORE_THRESHOLD_S + scoreIncrement);
             // Ensure score is at least the threshold
             requiredScore = Math.max(OngekiCalculator.SCORE_THRESHOLD_S, requiredScore);
        } else {
             // This case should be caught by the check against baseRateWithoutScoreBonuses earlier
             return '計算エラー (必要ボーナスが負)';
        }

        // Ensure the calculated score does not exceed the maximum possible score
        requiredScore = Math.min(requiredScore, OngekiCalculator.MAX_SCORE);
        // Ensure score is an integer
        requiredScore = Math.floor(requiredScore);

        // Return the calculated score, formatted with commas
        return requiredScore.toLocaleString();
    }
}

// Initialize the calculator once the DOM is fully loaded and parsed
// The 'defer' attribute in the script tag handles this, so DOMContentLoaded might be redundant,
// but it's safe to keep for broader compatibility or if 'defer' is removed.
// document.addEventListener('DOMContentLoaded', () => {
    new OngekiCalculator();
    // Initial call to Feather Icons after DOM is ready
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
// });
