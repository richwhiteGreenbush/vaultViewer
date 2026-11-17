/** Lets the browser render and handle input before continuing (splits long main-thread tasks). */
export const yieldToBrowser = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
