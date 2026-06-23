if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
            console.log("Service Worker desregistrado forzosamente");
        }
    });
    window.location.reload(true);
}
