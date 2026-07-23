const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Rewrite PlayerCard component with 66x66 dice box & precise SVG path
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

  const perimeter = 216;
  
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
    
    // Custom SVG paths for 66x66 dice box
    const rightAlignPath = "M 63 33 L 63 49 A 14 14 0 0 1 49 63 L 17 63 A 14 14 0 0 1 3 49 L 3 17 A 14 14 0 0 1 17 3 L 49 3 A 14 14 0 0 1 63 17 Z";
    const leftAlignPath = "M 3 33 L 3 17 A 14 14 0 0 1 17 3 L 49 3 A 14 14 0 0 1 63 17 L 63 49 A 14 14 0 0 1 49 63 L 17 63 A 14 14 0 0 1 4 59 Z";
    const pathData = isLeft ? rightAlignPath : leftAlignPath;

    return (
      <View style={styles.diceBoxWrapper}>
        <Svg width={66} height={66} style={StyleSheet.absoluteFill}>
          <Path d={pathData} stroke="#334155" strokeWidth={3.5} fill="none" />
          {isActive && (
            <AnimatedPath
              d={pathData}
              stroke={timerColor}
              strokeWidth={4.5}
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
          style={{ width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }}
        >
          {isActive && (
            <Animated.View style={[
              { alignItems: 'center', justifyContent: 'center' },
              diceTransform ? { transform: diceTransform } : undefined
            ]}>
              <Dice value={diceValue} size={46} />
            </Animated.View>
          )}
        </TouchableOpacity>
        <View style={[styles.bubblePointer, 
          isLeft ? { right: -5, top: 28, transform: [{rotate: '45deg'}] } : { left: -5, top: 28, transform: [{rotate: '45deg'}] },
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

// 2. Update player wrapper styles with negative top/bottom offsets (-32px)
code = code.replace(
  "topLeftPlayerWrapper: { position: 'absolute', top: 5, left: -5, zIndex: 100 },",
  "topLeftPlayerWrapper: { position: 'absolute', top: -32, left: -10, zIndex: 100 },"
);
code = code.replace(
  "topRightPlayerWrapper: { position: 'absolute', top: 5, right: -5, zIndex: 100 },",
  "topRightPlayerWrapper: { position: 'absolute', top: -32, right: -10, zIndex: 100 },"
);
code = code.replace(
  "bottomLeftPlayerWrapper: { position: 'absolute', bottom: 5, left: -5, zIndex: 100 },",
  "bottomLeftPlayerWrapper: { position: 'absolute', bottom: -32, left: -10, zIndex: 100 },"
);
code = code.replace(
  "bottomRightPlayerWrapper: { position: 'absolute', bottom: 5, right: -5, zIndex: 100 },",
  "bottomRightPlayerWrapper: { position: 'absolute', bottom: -32, right: -10, zIndex: 100 },"
);

// 3. Update avatar and dice box styles for 66x66 & 62x62 dimensions
const oldStyles = `avatarBorderContainer: { width: 68, height: 68, borderRadius: 34, borderWidth: 3.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', overflow: 'hidden', marginHorizontal: 4 },
  avatarImageLarge: { width: 60, height: 60, borderRadius: 30 },
  diceBoxWrapper: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative', marginHorizontal: 8, backgroundColor: 'rgba(15, 23, 42, 0.95)' },`;

const newStyles = `avatarBorderContainer: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', overflow: 'hidden', marginHorizontal: 4 },
  avatarImageLarge: { width: 54, height: 54, borderRadius: 27 },
  diceBoxWrapper: { width: 66, height: 66, borderRadius: 17, alignItems: 'center', justifyContent: 'center', position: 'relative', marginHorizontal: 6, backgroundColor: 'rgba(15, 23, 42, 0.95)' },`;

code = code.replace(oldStyles, newStyles);

fs.writeFileSync(filePath, code);
console.log('Successfully updated player cards with 56px clear gap from board');
