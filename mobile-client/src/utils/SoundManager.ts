import { Audio } from 'expo-av';

class SoundManager {
  private static instance: SoundManager;

  private gameWinnerSound: Audio.Sound | null = null;
  private gameLoserSound: Audio.Sound | null = null;
  private pawnHopSound: Audio.Sound | null = null;
  private diceRollSound: Audio.Sound | null = null;
  private gameStartSound: Audio.Sound | null = null;
  private pawnHomeSound: Audio.Sound | null = null;
  private pawnKilledSound: Audio.Sound | null = null;
  private loseHeartSound: Audio.Sound | null = null;

  private isLoaded = false;
  private hopLoopActive = false;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  public async preloadSounds() {
    if (this.isLoaded) return;
    try {
      // Audio session config
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const [
        { sound: winner },
        { sound: loser },
        { sound: hop },
        { sound: dice },
        { sound: start },
        { sound: home },
        { sound: killed },
        { sound: loseHeart }
      ] = await Promise.all([
        Audio.Sound.createAsync(require('../../assets/sounds/game_winner.mp3')),
        Audio.Sound.createAsync(require('../../assets/sounds/game_loser.mp3')),
        Audio.Sound.createAsync(require('../../assets/sounds/pawn_hop.mp3')),
        Audio.Sound.createAsync(require('../../assets/sounds/dice_roll.mp3')),
        Audio.Sound.createAsync(require('../../assets/sounds/game_start.mp3')),
        Audio.Sound.createAsync(require('../../assets/sounds/pawn_home.mp3')),
        Audio.Sound.createAsync(require('../../assets/sounds/pawn_killed.mp3')),
        Audio.Sound.createAsync(require('../../assets/sounds/lose_heart.mp3')),
      ]);

      this.gameWinnerSound = winner;
      this.gameLoserSound = loser;
      this.pawnHopSound = hop;
      this.diceRollSound = dice;
      this.gameStartSound = start;
      this.pawnHomeSound = home;
      this.pawnKilledSound = killed;
      this.loseHeartSound = loseHeart;

      this.isLoaded = true;
    } catch (err) {
      console.warn('Failed to load sounds', err);
    }
  }

  public async playGameStart() {
    await this.playSound(this.gameStartSound);
  }

  public async playDiceRoll() {
    await this.playSound(this.diceRollSound);
  }

  public async playWin() {
    await this.playSound(this.gameWinnerSound);
  }

  public async playLoss() {
    await this.playSound(this.gameLoserSound);
  }

  public async playHomeEnter() {
    await this.playSound(this.pawnHomeSound);
  }

  public async playKilled() {
    await this.playSound(this.pawnKilledSound);
  }

  public async playLoseHeart() {
    await this.playSound(this.loseHeartSound);
  }

  public async playPawnHop(hops: number, durationPerHop: number = 200) {
    if (!this.pawnHopSound || hops <= 0) return;
    try {
      this.hopLoopActive = true;
      let hopsDone = 0;
      
      const hopInterval = setInterval(async () => {
        if (!this.hopLoopActive || hopsDone >= hops) {
          clearInterval(hopInterval);
          this.hopLoopActive = false;
          return;
        }
        await this.playSound(this.pawnHopSound);
        hopsDone++;
      }, durationPerHop);
    } catch (err) {
      console.warn('Error playing pawn hop sound', err);
    }
  }

  public stopPawnHop() {
    this.hopLoopActive = false;
  }

  private async playSound(sound: Audio.Sound | null) {
    if (!sound) return;
    try {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch (err) {
      console.warn('Error playing sound', err);
    }
  }

  public async unloadAll() {
    try {
      this.hopLoopActive = false;
      const unloadPromises = [
        this.gameWinnerSound?.unloadAsync(),
        this.gameLoserSound?.unloadAsync(),
        this.pawnHopSound?.unloadAsync(),
        this.diceRollSound?.unloadAsync(),
        this.gameStartSound?.unloadAsync(),
        this.pawnHomeSound?.unloadAsync(),
        this.pawnKilledSound?.unloadAsync(),
        this.loseHeartSound?.unloadAsync(),
      ];
      await Promise.all(unloadPromises);
      this.isLoaded = false;
    } catch (err) {
      console.warn('Error unloading sounds', err);
    }
  }
}

export default SoundManager.getInstance();
