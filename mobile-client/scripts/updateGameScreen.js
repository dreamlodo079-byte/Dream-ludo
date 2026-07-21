const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');

// 1. Add Image to imports
code = code.replace(
  'useWindowDimensions,\n  Platform,\n} from \'react-native\';',
  'useWindowDimensions,\n  Platform,\n  Image,\n} from \'react-native\';'
);

// 2. Replace PlayerCard component
const playerCardStart = code.indexOf('// ============ PLAYER CARD (PREMIUM LIKE MPL/ZUPEE) ============');
const playerCardEnd = code.indexOf('// ============ MAIN GAME SCREEN ============');
if (playerCardStart !== -1 && playerCardEnd !== -1) {
  const newPlayerCard = `// ============ PLAYER CARD (PREMIUM LIKE MPL/ZUPEE) ============
interface PlayerCardProps {
  username: string;
  phone?: string;
  color: 'red' | 'green';
  isActive: boolean;
  isCurrentUser: boolean;
  turnTimer: number;
  totalTime: number;
  align: 'left' | 'right';
  diceValue: number;
  isDiceAnimating: boolean;
  canRoll: boolean;
  onRoll: () => void;
  avatarUri: any;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const maskPhone = (phone?: string) => {
  if (!phone) return '62#######60';
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 4) return phone;
  return \`\${clean.substring(0, 2)}#######\${clean.substring(clean.length - 2)}\`;
};

const PlayerCard: React.FC<PlayerCardProps> = ({
  username,
  phone,
  color,
  isActive,
  isCurrentUser,
  turnTimer,
  totalTime,
  align,
  diceValue,
  isDiceAnimating,
  canRoll,
  onRoll,
  avatarUri,
}) => {
  const c = COLORS[color];
  const animatedRatio = useRef(new Animated.Value(turnTimer / totalTime)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.timing(animatedRatio, {
        toValue: Math.max(0, (turnTimer - 1) / totalTime),
        duration: 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      }).start();
      
      if (canRoll) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          ])
        ).start();
      } else {
        pulseAnim.setValue(1);
      }
    } else {
      animatedRatio.setValue(1);
      pulseAnim.setValue(1);
    }
  }, [turnTimer, isActive, totalTime, canRoll]);

  const ringSize = 70;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const animatedDashoffset = animatedRatio.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : (color === 'green' ? '#22C55E' : '#3B82F6'); 

  const renderHearts = () => (
    <View style={styles.heartsRow}>
      <Text style={styles.heartIcon}>🤍</Text>
      <Text style={styles.heartIcon}>🤍</Text>
      <Text style={styles.heartIcon}>🤍</Text>
    </View>
  );

  const renderDiceBubble = () => {
    const isLeft = align === 'right'; 
    return (
      <Animated.View style={[styles.diceSpeechBubble, 
        isActive && { borderColor: '#22C55E', backgroundColor: '#0F172A', borderWidth: 2 },
        !isActive && { borderColor: '#475569', backgroundColor: 'rgba(30, 41, 59, 0.6)', borderWidth: 1 },
        { transform: [{ scale: pulseAnim }] }
      ]}>
        <TouchableOpacity disabled={!canRoll} onPress={onRoll} activeOpacity={0.8} style={{alignItems: 'center', justifyContent: 'center', width: 44, height: 44}}>
          {isDiceAnimating ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Dice value={diceValue} size={36} />
          )}
        </TouchableOpacity>
        <View style={[styles.bubblePointer, 
          isLeft ? { right: -5, transform: [{rotate: '45deg'}] } : { left: -5, transform: [{rotate: '45deg'}] },
          isActive ? { backgroundColor: '#0F172A', borderColor: '#22C55E' } : { backgroundColor: '#1E293B', borderColor: '#475569' },
          isLeft ? { borderTopWidth: 2, borderRightWidth: 2 } : { borderBottomWidth: 2, borderLeftWidth: 2 }
        ]} />
      </Animated.View>
    );
  };

  const renderAvatarRing = () => (
    <View style={styles.avatarRingContainer}>
      <Svg width={ringSize} height={ringSize}>
        <Circle cx={ringSize/2} cy={ringSize/2} r={radius} stroke="#1E293B" strokeWidth={strokeWidth} fill="none" />
        {isActive && (
          <AnimatedCircle cx={ringSize/2} cy={ringSize/2} r={radius} stroke={timerColor} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={animatedDashoffset} strokeLinecap="round" transform={\`rotate(-90 \${ringSize/2} \${ringSize/2})\`} />
        )}
      </Svg>
      <Image source={avatarUri} style={styles.avatarImage} />
    </View>
  );

  return (
    <View style={styles.diagonalCardContainer}>
      {align === 'right' && (
        <View style={[styles.nameBadge, {backgroundColor: '#22C55E'}]}>
          <Text style={styles.nameBadgeText}>{username.toUpperCase()}</Text>
        </View>
      )}
      
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        {align === 'right' && renderDiceBubble()}
        {renderAvatarRing()}
        {align === 'left' && renderDiceBubble()}
      </View>
      
      {renderHearts()}

      {align === 'left' && (
        <View style={[styles.nameBadge, {backgroundColor: '#22C55E', marginTop: 4}]}>
          <Text style={styles.nameBadgeText}>{maskPhone(phone)}</Text>
        </View>
      )}
    </View>
  );
};

`;
  code = code.substring(0, playerCardStart) + newPlayerCard + code.substring(playerCardEnd);
} else {
  console.log('Failed to replace PlayerCard component');
}

// 3. Replace GameScreen layout
const renderStart = code.indexOf('return (\n    <View style={{ flex: 1, position: \'relative\' }}>');
const boardStart = code.indexOf('{/* ========== BOARD CONTAINER (OUTER) ========== */}');
if (renderStart !== -1 && boardStart !== -1) {
  const newTopLayout = `return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />
      <View style={StyleSheet.absoluteFill}>
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0B132B" />
              <Stop offset="1" stopColor="#1E293B" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#bgGrad)" />
        </Svg>
      </View>

      <SafeAreaView style={styles.safeArea}>
        {/* ========== TOP BAR ========== */}
        <View style={styles.premiumTopBar}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity style={styles.settingsBtn} onPress={handleExitPress}>
              <Text style={{fontSize: 20}}>⚙️</Text>
            </TouchableOpacity>
            <View style={styles.signalBars}>
              <View style={[styles.signalBar, {height: 6}]} />
              <View style={[styles.signalBar, {height: 10}]} />
              <View style={[styles.signalBar, {height: 14}]} />
              <View style={[styles.signalBar, {height: 18}]} />
            </View>
          </View>

          <View style={styles.prizePoolBadge}>
            <Text style={styles.prizePoolTitle}>🏆 PRIZE POOL 🏆</Text>
            <Text style={styles.prizePoolValue}>₹{prizePool.toFixed(0)}</Text>
          </View>
          <View style={{width: 60}} />
        </View>

        <View style={{alignItems: 'center', marginTop: 10}}>
          <View style={styles.matchTimerCapsule}>
             <Text style={styles.matchTimerText}>🕒 {matchState.gameMode === 'QUICK' && matchState.matchTimer !== undefined ? \`\${Math.floor(matchState.matchTimer / 60)}:\${String(matchState.matchTimer % 60).padStart(2, '0')}\` : '04:53'}</Text>
          </View>
        </View>

        {/* ========== GAME ARENA ========== */}
        <View style={styles.arenaContainer}>
          
          <View style={styles.topRightPlayerWrapper}>
            <PlayerCard
              username={matchState.players[1]?.username || 'Player 2'}
              color="green"
              isActive={matchState.activePlayerIndex === 1}
              isCurrentUser={matchState.players[1]?.id === currentUser._id}
              turnTimer={matchState.turnTimer}
              totalTime={15}
              align="right"
              diceValue={matchState.activePlayerIndex === 1 ? (diceDisplayVal || 1) : 1}
              isDiceAnimating={matchState.activePlayerIndex === 1 && isDiceAnimating}
              canRoll={false}
              onRoll={() => {}}
              avatarUri={require('../../assets/avatar.png')}
            />
          </View>

          <View style={styles.bottomLeftPlayerWrapper}>
             <PlayerCard
              username={matchState.players[0]?.username || 'Player 1'}
              phone={currentUser.phone}
              color="red"
              isActive={matchState.activePlayerIndex === 0}
              isCurrentUser={matchState.players[0]?.id === currentUser._id}
              turnTimer={matchState.turnTimer}
              totalTime={15}
              align="left"
              diceValue={matchState.activePlayerIndex === 0 ? (diceDisplayVal || 1) : 1}
              isDiceAnimating={matchState.activePlayerIndex === 0 && isDiceAnimating}
              canRoll={isMyTurn && !matchState.hasRolled && !isDiceAnimating}
              onRoll={handleRollDice}
              avatarUri={require('../../assets/avatar.png')}
            />
          </View>

          `;
  code = code.substring(0, renderStart) + newTopLayout + code.substring(boardStart);
} else {
  console.log('Failed to replace layout component');
}

// 4. Remove bottom panel
const bottomPanelStart = code.indexOf('{/* ============ BOTTOM CONTROL PANEL ============ */}');
const bottomPanelEnd = code.indexOf('{/* ============ EXIT CONFIRM MODAL ============ */}');
if (bottomPanelStart !== -1 && bottomPanelEnd !== -1) {
  code = code.substring(0, bottomPanelStart) + code.substring(bottomPanelEnd);
} else {
  console.log('Failed to remove bottom panel');
}

// 5. Add new styles
const stylesToAppend = `
  mainContainer: { flex: 1, backgroundColor: '#0B132B' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 6 },
  premiumTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 10 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#475569', marginRight: 10 },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', height: 18, gap: 2 },
  signalBar: { width: 4, backgroundColor: '#22C55E', borderRadius: 2 },
  prizePoolBadge: { alignItems: 'center', backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: '#F59E0B' },
  prizePoolTitle: { fontSize: 10, color: '#FCD34D', fontWeight: '800', letterSpacing: 1 },
  prizePoolValue: { fontSize: 18, color: '#FFFFFF', fontWeight: '900', marginTop: 2 },
  matchTimerCapsule: { backgroundColor: '#166534', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 2, borderColor: '#22C55E' },
  matchTimerText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  arenaContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  topRightPlayerWrapper: { position: 'absolute', top: 30, right: 10, zIndex: 100 },
  bottomLeftPlayerWrapper: { position: 'absolute', bottom: 30, left: 10, zIndex: 100 },
  diagonalCardContainer: { alignItems: 'center' },
  nameBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  nameBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  avatarDiceRow: { flexDirection: 'row', alignItems: 'center' },
  avatarRingContainer: { width: 70, height: 70, justifyContent: 'center', alignItems: 'center', position: 'relative', marginHorizontal: 8 },
  avatarImage: { width: 56, height: 56, borderRadius: 28, position: 'absolute' },
  diceSpeechBubble: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bubblePointer: { position: 'absolute', width: 10, height: 10 },
  heartsRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  heartIcon: { fontSize: 12 },
});`;

// safely inject styles right before the final `});`
const lastBraceIndex = code.lastIndexOf('});');
if (lastBraceIndex !== -1) {
  code = code.substring(0, lastBraceIndex) + stylesToAppend + code.substring(lastBraceIndex + 3);
}

fs.writeFileSync(filePath, code);
console.log('Successfully updated GameScreen.tsx');
