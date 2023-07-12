export const unhandledRejectionListener = () => {
    process.on('unhandledRejection', (reason, promise) => {
        console.log('Unhandled Rejection at:', promise, 'reason:', reason);
        // You could do some additional cleanup here or send an alert, for instance
    });
}
