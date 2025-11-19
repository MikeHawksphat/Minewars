const App = {
    username: localStorage.getItem('mw_username') || '',
    init: () => {
        if (App.username) {
            document.getElementById('username-input').value = App.username;
            App.login();
        }
        // Wait for MineWars to be available if it's not yet loaded, though in this flow it should be.
        if (window.MineWars) {
            MineWars.updateSlider(document.getElementById('slider-players'));
        }
    },
    login: () => {
        const input = document.getElementById('username-input').value.trim().toUpperCase();
        if (!input) return;
        App.username = input;
        localStorage.setItem('mw_username', App.username);
        document.getElementById('user-display-name').innerText = App.username;
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('hub-view').classList.remove('hidden');
    },
    leaveLobby: () => {
        if (window.MineWars) {
            MineWars.showExitModal();
        }
    }
};
