export const roomLocks = new Map<string, Promise<void>>();

export const runWithRoomLock = async (roomId: string, task: () => Promise<void>) => {
  const currentLock = roomLocks.get(roomId) || Promise.resolve();
  
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  
  roomLocks.set(roomId, currentLock.then(() => nextLock));
  
  try {
    await currentLock;
    await task();
  } finally {
    release!();
    // Only delete the lock if no one else has queued up behind us
    if (roomLocks.get(roomId) === nextLock) {
      roomLocks.delete(roomId);
    }
  }
};
