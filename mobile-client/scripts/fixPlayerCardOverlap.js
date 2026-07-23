const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Update PlayerCard component to place score pill side-by-side with name badge
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
  diceTransform?: any[];
  score?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

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
  diceTransform,
  score,
}) => {
  const c = COLORS[color];
  const animatedRatio = useRef(new Animated.Value(turnTimer / totalTime)).current;

  useEffect(() => {
    if (isActive) {
      Animated.timing(animatedRatio, {
        toValue: Math.max(0, (turnTimer - 1) / totalTime),
        duration: 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      }).start();
    } else {
      animatedRatio.setValue(1);
    }
  }, [turnTimer, isActive, totalTime]);

  const perimeter = 259;
  
  const animatedDashoffset = animatedRatio.interpolate({
    inputRange: [0, 1],
    outputRange: [perimeter, 0],
  });
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : c.primary; 

  const renderScorePill = () => (
    <View style={[
      styles.scorePillContainer,
      align === 'right' ? { marginRight: 6 } : { marginLeft: 6 }
    ]}>
      <Text style={styles.scoreIcon}>🏆</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={styles.scoreValueText}>{score ?? 0}</Text>
        <Text style={styles.scoreUnitText}> PTS</Text>
      </View>
    </View>
  );

  const renderDiceBubble = () => {
    const isLeft = align === 'right'; 
    
    const rightAlignPath = "M 76 40 L 76 59 A 17 17 0 0 1 59 76 L 21 76 A 17 17 0 0 1 4 59 L 4 21 A 17 17 0 0 1 21 4 L 59 4 A 17 17 0 0 1 76 21 Z";
    const leftAlignPath = "M 4 40 L 4 21 A 17 17 0 0 1 21 4 L 59 4 A 17 17 0 0 1 76 21 L 76 59 A 17 17 0 0 1 59 76 L 21 76 A 17 17 0 0 1 4 59 Z";
    const pathData = isLeft ? rightAlignPath : leftAlignPath;

    return (
      <View style={styles.diceBoxWrapper}>
        <Svg width={80} height={80} style={StyleSheet.absoluteFill}>
          <Path d={pathData} stroke="#334155" strokeWidth={4} fill="none" />
          {isActive && (
            <AnimatedPath
              d={pathData}
              stroke={timerColor}
              strokeWidth={5.5}
              fill="none"
              strokeDasharray={perimeter}
              strokeDashoffset={animatedDashoffset}
              strokeLinecap="round"
            />
          )}
        </Svg>
        <TouchableOpacity
          disabled={!canRoll}
          onPress={onRoll}
          activeOpacity={0.8}
          style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}
        >
          {isActive && (
            <Animated.View style={[
              { alignItems: 'center', justifyContent: 'center' },
              diceTransform ? { transform: diceTransform } : undefined
            ]}>
              <Dice value={diceValue} size={54} />
            </Animated.View>
          )}
        </TouchableOpacity>
        <View style={[styles.bubblePointer, 
          isLeft ? { right: -6, transform: [{rotate: '45deg'}] } : { left: -6, transform: [{rotate: '45deg'}] },
          { backgroundColor: '#0F172A', borderColor: isActive ? timerColor : '#334155' },
          isLeft ? { borderTopWidth: 2, borderRightWidth: 2 } : { borderBottomWidth: 2, borderLeftWidth: 2 }
        ]} />
      </View>
    );
  };

  const renderAvatar = () => (
    <View style={[styles.avatarBorderContainer, { borderColor: c.primary }]}>
      <Image source={avatarUri} style={styles.avatarImageLarge} />
    </View>
  );

  return (
    <View style={[styles.diagonalCardContainer, { alignItems: align === 'right' ? 'flex-end' : 'flex-start' }]}>
      {align === 'right' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          {score !== undefined && renderScorePill()}
          <View style={[styles.nameBadge, { backgroundColor: c.primary, marginBottom: 0 }]}>
            <Text style={styles.nameBadgeText}>{username.toUpperCase()}</Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {align === 'right' && renderDiceBubble()}
        {renderAvatar()}
        {align === 'left' && renderDiceBubble()}
      </View>

      {align === 'left' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <View style={[styles.nameBadge, { backgroundColor: c.primary }]}>
            <Text style={styles.nameBadgeText}>{maskPhone(phone)}</Text>
          </View>
          {score !== undefined && renderScorePill()}
        </View>
      )}
    </View>
  );
};

`;
  code = code.substring(0, playerCardStart) + newPlayerCard + code.substring(playerCardEnd);
}

// 2. Increase outer arena container height from BOARD_SIZE + 180 to BOARD_SIZE + 240
code = code.replace(
  "height: BOARD_SIZE + 180, justifyContent: 'center'",
  "height: BOARD_SIZE + 240, justifyContent: 'center'"
);

// 3. Update wrapper styles for 5px inset padding
code = code.replace(
  "topLeftPlayerWrapper: { position: 'absolute', top: 0, left: -5, zIndex: 100 },",
  "topLeftPlayerWrapper: { position: 'absolute', top: 5, left: -5, zIndex: 100 },"
);
code = code.replace(
  "topRightPlayerWrapper: { position: 'absolute', top: 0, right: -5, zIndex: 100 },",
  "topRightPlayerWrapper: { position: 'absolute', top: 5, right: -5, zIndex: 100 },"
);
code = code.replace(
  "bottomLeftPlayerWrapper: { position: 'absolute', bottom: 0, left: -5, zIndex: 100 },",
  "bottomLeftPlayerWrapper: { position: 'absolute', bottom: 5, left: -5, zIndex: 100 },"
);
code = code.replace(
  "bottomRightPlayerWrapper: { position: 'absolute', bottom: 0, right: -5, zIndex: 100 },",
  "bottomRightPlayerWrapper: { position: 'absolute', bottom: 5, right: -5, zIndex: 100 },"
);

// 4. Update scorePillContainer style for compact header/footer alignment
const oldPillStyle = `scorePillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },`;

const newPillStyle = `scorePillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },`;

code = code.replace(oldPillStyle, newPillStyle);

fs.writeFileSync(filePath, code);
console.log('Successfully resolved player card overlap on board');
