(() => {
    const today = () => {
        const d = new Date();
        return [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0")
        ].join("-");
    };

    const currentMonth = () => today().slice(0, 7);

    const money = value => new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR"
    }).format(Number(value) || 0);

    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

    const dbConfig = window.MONEY_MANAGER_CONFIG;

    let db = null;
    let currentUser = null;
    let categoryChart = null;
    let expenseChart = null;
    let installPrompt = null;

    const state = {
        starting: 0,
        goal: 0,
        movements: [],
        budgets: []
    };

    const $ = id => document.getElementById(id);

    function showNotice(id, message, type = "") {
        const element = $(id);
        if (!element) return;

        element.textContent = message;
        element.className = "notice visible";

        if (type) element.classList.add(type);
    }

    function hideNotice(id) {
        const element = $(id);
        if (!element) return;

        element.textContent = "";
        element.className = "notice";
    }

    function setBusy(buttonId, busy, busyText = "Attendere...") {
        const button = $(buttonId);
        if (!button) return;

        if (busy) {
            button.dataset.originalText = button.textContent;
            button.textContent = busyText;
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
        }
    }

    function setSignedIn(signedIn) {
        $("authPanel").classList.toggle("hidden", signedIn);
        $("appContent").classList.toggle("hidden", !signedIn);
        $("signOutBtn").classList.toggle("hidden", !signedIn);
        $("exportBtn").classList.toggle("hidden", !signedIn);
        $("importBtn").classList.toggle("hidden", !signedIn);
        $("configNotice").classList.toggle("hidden", signedIn);

        if (signedIn) {
            $("date").value = today();

            if (!$("budgetMonth").value) {
                $("budgetMonth").value = currentMonth();
            }
        }
    }

    function explainError(error) {
        if (!error) return "Si è verificato un errore.";

        const message = error.message || String(error);

        if (message.includes("Invalid login credentials")) {
            return "Email o password non corretti.";
        }

        if (message.includes("Email not confirmed")) {
            return "Devi prima confermare la tua email.";
        }

        if (message.includes("User already registered")) {
            return "Questa email è già registrata. Prova ad accedere.";
        }

        if (message.includes("Failed to fetch")) {
            return "Connessione non disponibile. Controlla Internet.";
        }

        if (
            message.includes("money_manager_budgets") ||
            message.includes("money_manager_movements") ||
            message.includes("money_manager_settings")
        ) {
            return "Errore nelle tabelle di Supabase. Controlla il nome delle tabelle e le autorizzazioni.";
        }

        return message;
    }

    function totals() {
        let income = 0;
        let expense = 0;

        for (const movement of state.movements) {
            const amount = Number(movement.amount) || 0;

            if (movement.type === "income") {
                income += amount;
            } else {
                expense += amount;
            }
        }

        return {
            income,
            expense,
            balance: Number(state.starting) + income - expense
        };
    }

    function sumExpenses(movements) {
        return movements.reduce((total, movement) => {
            if (movement.type === "expense") {
                return total + Number(movement.amount || 0);
            }

            return total;
        }, 0);
    }

    function getMonthMovements(month) {
        return state.movements.filter(movement => {
            return movement.date && movement.date.startsWith(month);
        });
    }

    function dateMinusDays(days) {
        const date = new Date();

        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - days);

        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function periodMovements(period) {
        const currentDay = today();
        const currentYear = String(new Date().getFullYear());

        return state.movements.filter(movement => {
            if (!movement.date) return false;

            if (period === "day") return movement.date === currentDay;

            if (period === "week") {
                return movement.date >= dateMinusDays(6) &&
                    movement.date <= currentDay;
            }

            if (period === "month") {
                return movement.date.startsWith(currentMonth());
            }

            if (period === "year") {
                return movement.date.startsWith(currentYear);
            }

            return false;
        });
    }

    function periodLabel(period) {
        const labels = {
            day: "Oggi",
            week: "Ultimi 7 giorni",
            month: "Questo mese",
            year: "Quest'anno"
        };

        return labels[period] || "Periodo";
    }

    function render() {
        const result = totals();

        const monthMovements = getMonthMovements(currentMonth());

        const monthIncome = monthMovements.reduce((total, movement) => {
            return total + (
                movement.type === "income"
                    ? Number(movement.amount || 0)
                    : 0
            );
        }, 0);

        const monthExpense = sumExpenses(monthMovements);

        $("balance").textContent = money(result.balance);
        $("income").textContent = money(result.income);
        $("expense").textContent = money(result.expense);
        $("monthIncome").textContent = money(monthIncome);
        $("monthExpense").textContent = money(monthExpense);

        $("startingBalance").value = state.starting;
        $("goalInput").value = state.goal;
        $("goalBalance").textContent = money(result.balance);

        if (state.goal > 0) {
            const percentage = Math.max(
                0,
                Math.min(100, result.balance / state.goal * 100)
            );

            $("goalBar").style.width = `${percentage}%`;

            $("goalText").textContent =
                `${percentage.toFixed(1)}% raggiunto · Mancano ${money(Math.max(0, state.goal - result.balance))}`;

            if (result.balance >= state.goal) {
                $("goalText").textContent =
                    `Obiettivo raggiunto! Saldo: ${money(result.balance)}.`;
            }
        } else {
            $("goalBar").style.width = "0%";
            $("goalText").textContent = "Imposta un obiettivo per iniziare.";
        }

        renderTransactions();
        renderCategories();
        renderStatistics();
        renderBudgets();
    }

    async function loadCloudData() {
        const { data: settings, error: settingsError } = await db
            .from("money_manager_settings")
            .select("*")
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (settingsError) throw settingsError;

        if (settings) {
            state.starting = Number(settings.starting_balance) || 0;
            state.goal = Number(settings.goal) || 0;
        } else {
            const { error } = await db
                .from("money_manager_settings")
                .upsert({
                    user_id: currentUser.id,
                    starting_balance: 0,
                    goal: 0
                }, {
                    onConflict: "user_id"
                });

            if (error) throw error;

            state.starting = 0;
            state.goal = 0;
        }

        const { data: movements, error: movementsError } = await db
            .from("money_manager_movements")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("movement_date", { ascending: false })
            .order("created_at", { ascending: false });

        if (movementsError) throw movementsError;

        state.movements = (movements || []).map(movement => ({
            id: movement.id,
            type: movement.type,
            amount: Number(movement.amount) || 0,
            category: movement.category || "Altro",
            description: movement.description || "",
            date: movement.movement_date
        }));

        await loadBudgets();
        render();
    }

    async function loadBudgets() {
        const { data, error } = await db
            .from("money_manager_budgets")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("month", { ascending: false })
            .order("category", { ascending: true });

        if (error) throw error;

        state.budgets = (data || []).map(budget => ({
            id: budget.id,
            category: budget.category,
            month: budget.month,
            limit: Number(budget.limit_amount) || 0
        }));
    }

    async function saveSettings() {
        const { error } = await db
            .from("money_manager_settings")
            .upsert({
                user_id: currentUser.id,
                starting_balance: state.starting,
                goal: state.goal,
                updated_at: new Date().toISOString()
            }, {
                onConflict: "user_id"
            });

        if (error) throw error;
    }

    async function saveBudgetToCloud(category, month, limit) {
        const { error } = await db
            .from("money_manager_budgets")
            .upsert({
                user_id: currentUser.id,
                category,
                month,
                limit_amount: limit
            }, {
                onConflict: "user_id,category,month"
            });

        if (error) throw error;
    }

    function renderBudgets() {
        const selectedMonth = $("budgetMonth").value || currentMonth();

        const monthBudgets = state.budgets
            .filter(budget => budget.month === selectedMonth)
            .sort((a, b) => a.category.localeCompare(b.category, "it"));

        const monthMovements = getMonthMovements(selectedMonth)
            .filter(movement => movement.type === "expense");

        const monthTotal = sumExpenses(monthMovements);

        const totalLimit = monthBudgets.reduce((total, budget) => {
            return total + Number(budget.limit || 0);
        }, 0);

        const remaining = totalLimit - monthTotal;

        const percentage = totalLimit > 0
            ? monthTotal / totalLimit * 100
            : 0;

        const barPercentage = Math.min(100, percentage);

        let summaryClass = "";
        let summaryMessage = "Nessun budget impostato.";

        if (totalLimit > 0) {
            if (percentage >= 100) {
                summaryClass = "danger";
                summaryMessage = `Hai superato il budget complessivo di ${money(Math.abs(remaining))}.`;
            } else if (percentage >= 80) {
                summaryClass = "warning";
                summaryMessage = `Attenzione: hai utilizzato il ${percentage.toFixed(0)}% del budget complessivo.`;
            } else {
                summaryMessage = `Ti restano ${money(remaining)} da spendere.`;
            }
        }

        $("budgetsSummary").innerHTML = `
            <div class="budget-summary-card">
                <div class="budget-summary-grid">
                    <div>
                        <div class="muted">Budget totale</div>
                        <strong>${money(totalLimit)}</strong>
                    </div>
                    <div>
                        <div class="muted">Spese effettuate</div>
                        <strong>${money(monthTotal)}</strong>
                    </div>
                    <div>
                        <div class="muted">Disponibili</div>
                        <strong class="${summaryClass}">${money(remaining)}</strong>
                    </div>
                </div>

                <div class="budget-progress">
                    <div class="bar ${summaryClass}"
                         style="width:${barPercentage}%">
                    </div>
                </div>

                <div class="budget-summary-bottom ${summaryClass}">
                    ${escapeHtml(summaryMessage)}
                </div>

                <div class="muted">
                    ${percentage.toFixed(1)}% del budget complessivo utilizzato
                </div>
            </div>
        `;

        if (monthBudgets.length === 0) {
            $("budgetsList").innerHTML = `
                <div class="empty">
                    Nessun budget impostato per questo mese.
                    <br>
                    Aggiungi un limite qui sopra per iniziare.
                </div>
            `;

            return;
        }

        $("budgetsList").innerHTML = monthBudgets.map(budget => {
            const spent = monthMovements
                .filter(movement => movement.category === budget.category)
                .reduce((total, movement) => {
                    return total + Number(movement.amount || 0);
                }, 0);

            const limit = Number(budget.limit) || 0;
            const categoryRemaining = limit - spent;
            const categoryPercentage = limit > 0
                ? spent / limit * 100
                : 0;

            const categoryBarPercentage = Math.min(100, categoryPercentage);

            let barClass = "";
            let statusClass = "";
            let statusText = `Disponibili ${money(categoryRemaining)}`;

            if (categoryPercentage >= 100) {
                barClass = "danger";
                statusClass = "danger";
                statusText = `Limite superato di ${money(Math.abs(categoryRemaining))}`;
            } else if (categoryPercentage >= 80) {
                barClass = "warning";
                statusClass = "warning";
                statusText = `Attenzione: restano ${money(categoryRemaining)}`;
            }

            return `
                <div class="budget-item">
                    <div class="budget-top">
                        <div>
                            <div class="budget-category">
                                ${escapeHtml(budget.category)}
                            </div>
                            <div class="muted">
                                Limite: ${money(limit)}
                            </div>
                        </div>

                        <div class="budget-amount">
                            <div><strong>${money(spent)}</strong></div>
                            <div class="muted">
                                ${categoryPercentage.toFixed(0)}% utilizzato
                            </div>
                        </div>
                    </div>

                    <div class="budget-progress">
                        <div class="bar ${barClass}"
                             style="width:${categoryBarPercentage}%">
                        </div>
                    </div>

                    <div class="budget-bottom">
                        <div class="budget-status ${statusClass}">
                            ${escapeHtml(statusText)}
                        </div>

                        <div class="budget-actions">
                            <button
                                class="btn btn-secondary btn-small"
                                data-edit-budget="${escapeHtml(budget.category)}">
                                Modifica
                            </button>

                            <button
                                class="btn btn-danger btn-small"
                                data-delete-budget="${escapeHtml(budget.category)}">
                                Elimina
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderTransactions() {
        const filter = $("filter").value;

        const movements = [...state.movements]
            .filter(movement => {
                return filter === "all" || movement.type === filter;
            })
            .sort((a, b) => b.date.localeCompare(a.date));

        if (movements.length === 0) {
            $("transactions").innerHTML = `
                <div class="empty">Non ci sono movimenti da mostrare.</div>
            `;

            return;
        }

        $("transactions").innerHTML = movements.map(movement => {
            const isIncome = movement.type === "income";
            const sign = isIncome ? "+" : "-";
            const color = isIncome ? "green" : "red";

            return `
                <div class="transaction">
                    <div class="transaction-info">
                        <div class="transaction-title">
                            ${escapeHtml(movement.description || movement.category)}
                        </div>

                        <div class="transaction-details">
                            ${escapeHtml(movement.category)}
                            ·
                            ${escapeHtml(movement.date)}
                        </div>
                    </div>

                    <div class="transaction-right">
                        <div class="transaction-amount ${color}">
                            ${sign}${money(movement.amount)}
                        </div>

                        <button
                            class="btn btn-danger btn-small"
                            data-delete="${escapeHtml(movement.id)}">
                            Elimina
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderCategories() {
        const categories = {};

        for (const movement of state.movements) {
            if (movement.type !== "expense") continue;

            const category = movement.category || "Altro";

            categories[category] =
                (categories[category] || 0) + Number(movement.amount || 0);
        }

        const entries = Object.entries(categories)
            .sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            $("categories").innerHTML = `
                <div class="empty">Non ci sono ancora spese registrate.</div>
            `;

            return;
        }

        $("categories").innerHTML = entries.map(([category, amount]) => `
            <div class="category-row">
                <span>${escapeHtml(category)}</span>
                <strong>${money(amount)}</strong>
            </div>
        `).join("");
    }

    function renderStatistics() {
        const period = $("statisticsPeriod").value;
        const movements = periodMovements(period);
        const expenses = movements.filter(movement => movement.type === "expense");

        $("dailyExpense").textContent = money(
            sumExpenses(state.movements.filter(movement => movement.date === today()))
        );

        $("weeklyExpense").textContent = money(
            sumExpenses(state.movements.filter(movement => {
                return movement.date >= dateMinusDays(6) && movement.date <= today();
            }))
        );

        $("monthlyExpense").textContent = money(
            sumExpenses(getMonthMovements(currentMonth()))
        );

        $("yearlyExpense").textContent = money(
            sumExpenses(state.movements.filter(movement => {
                return movement.date && movement.date.startsWith(String(new Date().getFullYear()));
            }))
        );

        const categoryTotals = {};

        for (const movement of expenses) {
            const category = movement.category || "Altro";

            categoryTotals[category] =
                (categoryTotals[category] || 0) + Number(movement.amount || 0);
        }

        const categoryLabels = Object.keys(categoryTotals);
        const categoryValues = Object.values(categoryTotals);

        if (categoryChart) categoryChart.destroy();

        categoryChart = new Chart($("categoryChart"), {
            type: "doughnut",
            data: {
                labels: categoryLabels.length ? categoryLabels : ["Nessuna spesa"],
                datasets: [{
                    data: categoryValues.length ? categoryValues : [1],
                    backgroundColor: [
                        "#6c8cff",
                        "#39d98a",
                        "#ff647c",
                        "#ffc857",
                        "#a78bfa",
                        "#5eead4",
                        "#fb923c",
                        "#60a5fa",
                        "#f472b6",
                        "#a3e635",
                        "#94a3b8"
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: "#f2f4f8",
                            padding: 14
                        }
                    }
                }
            }
        });

        const grouped = {};

        for (const movement of expenses) {
            let label = movement.date;

            if (period === "year") {
                label = movement.date.slice(0, 7);
            }

            grouped[label] = (grouped[label] || 0) + Number(movement.amount || 0);
        }

        let labels = Object.keys(grouped).sort();

        if (period === "day") {
            labels = [today()];
            grouped[today()] = grouped[today()] || 0;
        }

        if (period === "week") {
            labels = [];

            for (let i = 6; i >= 0; i--) {
                const label = dateMinusDays(i);
                labels.push(label);
                grouped[label] = grouped[label] || 0;
            }
        }

        if (period === "month") {
            labels = [];

            const year = Number(currentMonth().slice(0, 4));
            const month = Number(currentMonth().slice(5, 7));
            const daysInMonth = new Date(year, month, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const label = `${currentMonth()}-${String(day).padStart(2, "0")}`;
                labels.push(label);
                grouped[label] = grouped[label] || 0;
            }
        }

        if (period === "year") {
            labels = [];

            const year = String(new Date().getFullYear());

            for (let month = 1; month <= 12; month++) {
                const label = `${year}-${String(month).padStart(2, "0")}`;
                labels.push(label);
                grouped[label] = grouped[label] || 0;
            }
        }

        const displayLabels = labels.map(label => {
            if (period === "year") {
                const monthNumber = Number(label.slice(5, 7));

                return new Date(2000, monthNumber - 1, 1)
                    .toLocaleDateString("it-IT", { month: "short" });
            }

            if (period === "month") return label.slice(8, 10);

            return label.slice(8, 10) + "/" + label.slice(5, 7);
        });

        if (expenseChart) expenseChart.destroy();

        expenseChart = new Chart($("expenseChart"), {
            type: "bar",
            data: {
                labels: displayLabels,
                datasets: [{
                    label: "Spese (€)",
                    data: labels.map(label => grouped[label] || 0),
                    backgroundColor: "#6c8cff",
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: "#f2f4f8"
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: "#9ba5ba",
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: "#9ba5ba"
                        },
                        grid: {
                            color: "#30384b"
                        }
                    }
                }
            }
        });

        if (expenses.length === 0) {
            $("periodExpenses").innerHTML = `
                <div class="empty">
                    Nessuna spesa registrata per: ${escapeHtml(periodLabel(period))}.
                </div>
            `;

            return;
        }

        $("periodExpenses").innerHTML = `
            <div class="category-row">
                <span>${escapeHtml(periodLabel(period))}</span>
                <strong>${money(sumExpenses(expenses))}</strong>
            </div>

            <div class="muted">
                ${expenses.length} movimenti di spesa nel periodo selezionato.
            </div>
        `;
    }

    async function runAuth(action) {
        hideNotice("authNotice");

        const email = $("authEmail").value.trim();
        const password = $("authPassword").value;

        try {
            if (action === "login") {
                const { error } = await db.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;
            }

            if (action === "signup") {
                const { data, error } = await db.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: "https://mastro1927.github.io/Money-manger/"
                    }
                });

                if (error) throw error;

                if (!data.session) {
                    showNotice(
                        "authNotice",
                        "Account creato. Controlla la tua email per confermare la registrazione.",
                        "success"
                    );
                }
            }

            if (action === "reset") {
                const { error } = await db.auth.resetPasswordForEmail(email, {
                    redirectTo: "https://mastro1927.github.io/Money-manger/"
                });

                if (error) throw error;

                showNotice(
                    "authNotice",
                    "Se l'indirizzo è registrato, riceverai un'email per recuperare la password.",
                    "success"
                );
            }
        } catch (error) {
            showNotice("authNotice", explainError(error), "error");
        }
    }

    async function saveMovement(event) {
        event.preventDefault();

        hideNotice("formNotice");
        setBusy("saveMovementBtn", true, "Salvataggio...");

        try {
            const amount = Number($("amount").value);

            if (!Number.isFinite(amount) || amount <= 0) {
                throw new Error("Inserisci un importo maggiore di zero.");
            }

            const movement = {
                user_id: currentUser.id,
                type: $("type").value,
                amount,
                category: $("category").value,
                description: $("description").value.trim(),
                movement_date: $("date").value
            };

            if (!movement.movement_date) {
                throw new Error("Seleziona una data.");
            }

            const { error } = await db
                .from("money_manager_movements")
                .insert(movement);

            if (error) throw error;

            $("amount").value = "";
            $("description").value = "";
            $("date").value = today();

            await loadCloudData();

            showNotice("formNotice", "Movimento aggiunto correttamente.", "success");
        } catch (error) {
            showNotice("formNotice", explainError(error), "error");
        } finally {
            setBusy("saveMovementBtn", false);
        }
    }

    async function deleteMovement(id) {
        if (!confirm("Vuoi eliminare questo movimento?")) return;

        try {
            const { error } = await db
                .from("money_manager_movements")
                .delete()
                .eq("id", id)
                .eq("user_id", currentUser.id);

            if (error) throw error;

            await loadCloudData();
            showNotice("notice", "Movimento eliminato.", "success");
        } catch (error) {
            showNotice("notice", explainError(error), "error");
        }
    }

    async function saveStartingBalance() {
        const value = Number($("startingBalance").value);

        if (!Number.isFinite(value) || value < 0) {
            showNotice("notice", "Inserisci un saldo iniziale valido.", "error");
            return;
        }

        try {
            state.starting = value;
            await saveSettings();
            render();

            showNotice("notice", "Saldo iniziale salvato.", "success");
        } catch (error) {
            showNotice("notice", explainError(error), "error");
        }
    }

    async function saveGoal() {
        const value = Number($("goalInput").value);

        if (!Number.isFinite(value) || value < 0) {
            showNotice("notice", "Inserisci un obiettivo valido.", "error");
            return;
        }

        try {
            state.goal = value;
            await saveSettings();
            render();

            showNotice("notice", "Obiettivo di risparmio salvato.", "success");
        } catch (error) {
            showNotice("notice", explainError(error), "error");
        }
    }

    async function saveBudget(event) {
        event.preventDefault();

        hideNotice("budgetNotice");
        setBusy("saveBudgetBtn", true, "Salvataggio...");

        try {
            const category = $("budgetCategory").value;
            const month = $("budgetMonth").value;
            const limit = Number($("budgetLimit").value);

            if (!month) {
                throw new Error("Seleziona il mese del budget.");
            }

            if (!category) {
                throw new Error("Seleziona una categoria.");
            }

            if (!Number.isFinite(limit) || limit <= 0) {
                throw new Error("Il limite deve essere maggiore di zero.");
            }

            await saveBudgetToCloud(category, month, limit);

            $("budgetLimit").value = "";
            $("saveBudgetBtn").textContent = "Salva budget";

            await loadBudgets();
            renderBudgets();

            showNotice(
                "budgetNotice",
                `Budget per ${category} salvato correttamente.`,
                "success"
            );
        } catch (error) {
            showNotice("budgetNotice", explainError(error), "error");
        } finally {
            setBusy("saveBudgetBtn", false);
        }
    }

    async function deleteBudget(budget) {
        const confirmed = confirm(
            `Vuoi eliminare il budget di ${budget.category} per ${budget.month}?`
        );

        if (!confirmed) return;

        try {
            const { error } = await db
                .from("money_manager_budgets")
                .delete()
                .eq("user_id", currentUser.id)
                .eq("category", budget.category)
                .eq("month", budget.month);

            if (error) throw error;

            await loadBudgets();
            renderBudgets();

            showNotice("budgetNotice", "Budget eliminato.", "success");
        } catch (error) {
            showNotice("budgetNotice", explainError(error), "error");
        }
    }

    function exportBackup() {
        const backup = {
            backupVersion: 3,
            exportedAt: new Date().toISOString(),
            state: {
                starting: state.starting,
                goal: state.goal,
                movements: state.movements,
                budgets: state.budgets
            }
        };

        const blob = new Blob(
            [JSON.stringify(backup, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `money-manager-backup-${today()}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        showNotice("notice", "Backup esportato correttamente.", "success");
    }

    async function importBackup(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const backup = JSON.parse(text);
            const data = backup.state;

            if (
                !data ||
                !Array.isArray(data.movements) ||
                !Number.isFinite(Number(data.starting)) ||
                !Number.isFinite(Number(data.goal))
            ) {
                throw new Error("Il file di backup non è valido.");
            }

            const confirmed = confirm(
                "Importare questo backup? I movimenti attuali verranno sostituiti."
            );

            if (!confirmed) return;

            for (const movement of data.movements) {
                if (
                    !["income", "expense"].includes(movement.type) ||
                    !Number.isFinite(Number(movement.amount)) ||
                    Number(movement.amount) <= 0 ||
                    !movement.date ||
                    !movement.category
                ) {
                    throw new Error("Il backup contiene un movimento non valido.");
                }
            }

            const { error: deleteError } = await db
                .from("money_manager_movements")
                .delete()
                .eq("user_id", currentUser.id);

            if (deleteError) throw deleteError;

            if (data.movements.length > 0) {
                const rows = data.movements.map(movement => ({
                    user_id: currentUser.id,
                    type: movement.type,
                    amount: Number(movement.amount),
                    category: movement.category,
                    description: movement.description || "",
                    movement_date: movement.date
                }));

                const { error } = await db
                    .from("money_manager_movements")
                    .insert(rows);

                if (error) throw error;
            }

            state.starting = Number(data.starting);
            state.goal = Number(data.goal);

            await saveSettings();

            if (Array.isArray(data.budgets)) {
                const { error: deleteBudgetsError } = await db
                    .from("money_manager_budgets")
                    .delete()
                    .eq("user_id", currentUser.id);

                if (deleteBudgetsError) throw deleteBudgetsError;

                if (data.budgets.length > 0) {
                    const budgets = data.budgets.map(budget => ({
                        user_id: currentUser.id,
                        category: budget.category,
                        month: budget.month,
                        limit_amount: Number(budget.limit)
                    }));

                    const { error } = await db
                        .from("money_manager_budgets")
                        .upsert(budgets, {
                            onConflict: "user_id,category,month"
                        });

                    if (error) throw error;
                }
            }

            await loadCloudData();

            showNotice("notice", "Backup importato correttamente.", "success");
        } catch (error) {
            showNotice("notice", explainError(error), "error");
        } finally {
            $("importFile").value = "";
        }
    }

    async function resetAll() {
        const confirmed = confirm(
            "Attenzione: verranno cancellati tutti i movimenti, tutti i budget e le impostazioni di saldo e obiettivo. Vuoi continuare?"
        );

        if (!confirmed) return;

        try {
            const { error: movementError } = await db
                .from("money_manager_movements")
                .delete()
                .eq("user_id", currentUser.id);

            if (movementError) throw movementError;

            const { error: budgetError } = await db
                .from("money_manager_budgets")
                .delete()
                .eq("user_id", currentUser.id);

            if (budgetError) throw budgetError;

            state.starting = 0;
            state.goal = 0;

            await saveSettings();
            await loadCloudData();

            showNotice("notice", "I tuoi dati sono stati azzerati.", "success");
        } catch (error) {
            showNotice("notice", explainError(error), "error");
        }
    }

    async function handleSession(session) {
        currentUser = session?.user || null;

        setSignedIn(Boolean(currentUser));

        if (!currentUser) {
            state.starting = 0;
            state.goal = 0;
            state.movements = [];
            state.budgets = [];

            return;
        }

        try {
            await loadCloudData();
        } catch (error) {
            showNotice("notice", explainError(error), "error");
        }
    }

    function setupEvents() {
        $("authForm").addEventListener("submit", event => {
            event.preventDefault();
            runAuth("login");
        });

        $("signupBtn").addEventListener("click", () => runAuth("signup"));
        $("resetPasswordBtn").addEventListener("click", () => runAuth("reset"));

        $("passwordUpdateForm").addEventListener("submit", async event => {
            event.preventDefault();

            try {
                const password = $("newPassword").value;

                if (password.length < 6) {
                    throw new Error("La password deve contenere almeno 6 caratteri.");
                }

                const { error } = await db.auth.updateUser({ password });
                if (error) throw error;

                $("newPassword").value = "";
                $("passwordUpdatePanel").classList.add("hidden");

                showNotice("authNotice", "Password aggiornata correttamente.", "success");
            } catch (error) {
                showNotice("authNotice", explainError(error), "error");
            }
        });

        $("signOutBtn").addEventListener("click", async () => {
            const { error } = await db.auth.signOut();

            if (error) {
                showNotice("notice", explainError(error), "error");
            }
        });

        $("txForm").addEventListener("submit", saveMovement);

        $("saveStarting").addEventListener("click", saveStartingBalance);
        $("saveGoal").addEventListener("click", saveGoal);

        $("budgetForm").addEventListener("submit", saveBudget);
        $("budgetMonth").addEventListener("change", renderBudgets);

        $("budgetCategory").addEventListener("change", () => {
            const month = $("budgetMonth").value || currentMonth();
            const category = $("budgetCategory").value;

            const existing = state.budgets.find(budget => {
                return budget.month === month && budget.category === category;
            });

            $("budgetLimit").value = existing ? existing.limit : "";
            $("saveBudgetBtn").textContent = existing
                ? "Aggiorna budget"
                : "Salva budget";
        });

        $("budgetsList").addEventListener("click", event => {
            const editButton = event.target.closest("[data-edit-budget]");
            const deleteButton = event.target.closest("[data-delete-budget]");

            const month = $("budgetMonth").value || currentMonth();

            if (editButton) {
                const category = editButton.dataset.editBudget;

                const budget = state.budgets.find(item => {
                    return item.category === category && item.month === month;
                });

                if (!budget) return;

                $("budgetCategory").value = budget.category;
                $("budgetLimit").value = budget.limit;
                $("saveBudgetBtn").textContent = "Aggiorna budget";
                $("budgetLimit").focus();
            }

            if (deleteButton) {
                const category = deleteButton.dataset.deleteBudget;

                const budget = state.budgets.find(item => {
                    return item.category === category && item.month === month;
                });

                if (budget) deleteBudget(budget);
            }
        });

        $("filter").addEventListener("change", renderTransactions);
        $("statisticsPeriod").addEventListener("change", renderStatistics);

        $("transactions").addEventListener("click", event => {
            const button = event.target.closest("[data-delete]");
            if (button) deleteMovement(button.dataset.delete);
        });

        $("exportBtn").addEventListener("click", exportBackup);

        $("importBtn").addEventListener("click", () => {
            $("importFile").click();
        });

        $("importFile").addEventListener("change", importBackup);
        $("resetBtn").addEventListener("click", resetAll);

        window.addEventListener("beforeinstallprompt", event => {
            event.preventDefault();
            installPrompt = event;
            $("installBtn").classList.remove("hidden");
        });

        $("installBtn").addEventListener("click", async () => {
            if (!installPrompt) return;

            installPrompt.prompt();
            await installPrompt.userChoice;

            installPrompt = null;
            $("installBtn").classList.add("hidden");
        });

        if ("serviceWorker" in navigator) {
            window.addEventListener("load", () => {
                navigator.serviceWorker.register("./sw.js").catch(() => {});
            });
        }

        window.addEventListener("popstate", () => {
            if (window.location.hash.includes("type=recovery")) {
                $("passwordUpdatePanel").classList.remove("hidden");
            }
        });
    }

    async function start() {
        setupEvents();

        $("date").value = today();
        $("budgetMonth").value = currentMonth();

        if (
            !dbConfig ||
            !dbConfig.url ||
            !dbConfig.publishableKey
        ) {
            showNotice(
                "configNotice",
                "Configurazione Supabase mancante. Controlla il file config.js.",
                "error"
            );

            return;
        }

        try {
            db = window.supabase.createClient(
                dbConfig.url,
                dbConfig.publishableKey
            );

            const { data, error } = await db.auth.getSession();

            if (error) throw error;

            await handleSession(data.session);

            db.auth.onAuthStateChange(async (event, session) => {
                if (event === "PASSWORD_RECOVERY") {
                    $("passwordUpdatePanel").classList.remove("hidden");
                }

                await handleSession(session);
            });

            if (window.location.hash.includes("type=recovery")) {
                $("passwordUpdatePanel").classList.remove("hidden");
            }
        } catch (error) {
            showNotice("configNotice", explainError(error), "error");
        }
    }

    start();
})();
