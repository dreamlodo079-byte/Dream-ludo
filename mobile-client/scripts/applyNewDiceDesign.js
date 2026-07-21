const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Rewrite PlayerCard component
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
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

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

  const perimeter = 265;
  const animatedDashoffset = animatedRatio.interpolate({
    inputRange: [0, 1],
    outputRange: [perimeter, 0],
  });
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : c.primary; 

  const renderDiceBubble = () => {
    if (!isActive) return null;
    const isLeft = align === 'right'; 
    return (
      <View style={styles.diceBoxWrapper}>
        <Svg width={80} height={80} style={StyleSheet.absoluteFill}>
          <Rect x={3} y={3} width={74} height={74} rx={18} ry={18} stroke="#1E293B" strokeWidth={3} fill="none" />
          <AnimatedRect
            x={3}
            y={3}
            width={74}
            height={74}
            rx={18}
            ry={18}
            stroke={timerColor}
            strokeWidth={3.5}
            fill="none"
            strokeDasharray={perimeter}
            strokeDashoffset={animatedDashoffset}
            strokeLinecap="round"
          />
        </Svg>
        <TouchableOpacity
          disabled={!canRoll}
          onPress={onRoll}
          activeOpacity={0.8}
          style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}
        >
          <Animated.View style={[
            { alignItems: 'center', justifyContent: 'center' },
            diceTransform ? { transform: diceTransform } : undefined
          ]}>
            <Dice value={diceValue} size={54} />
          </Animated.View>
        </TouchableOpacity>
        <View style={[styles.bubblePointer, 
          isLeft ? { right: -6, transform: [{rotate: '45deg'}] } : { left: -6, transform: [{rotate: '45deg'}] },
          { backgroundColor: '#0F172A', borderColor: timerColor },
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
    <View style={styles.diagonalCardContainer}>
      {align === 'right' && (
        <View style={[styles.nameBadge, { backgroundColor: c.primary }]}>
          <Text style={styles.nameBadgeText}>{username.toUpperCase()}</Text>
        </View>
      )}
      
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {align === 'right' && renderDiceBubble()}
        {renderAvatar()}
        {align === 'left' && renderDiceBubble()}
      </View>

      {align === 'left' && (
        <View style={[styles.nameBadge, { backgroundColor: c.primary, marginTop: 6 }]}>
          <Text style={styles.nameBadgeText}>{maskPhone(phone)}</Text>
        </View>
      )}
    </View>
  );
};

`;
  code = code.substring(0, playerCardStart) + newPlayerCard + code.substring(playerCardEnd);
} else {
  console.log('Failed to locate PlayerCard section');
}

// 2. Update styles in GameScreen
const newStyleRules = `
  avatarBorderContainer: { width: 68, height: 68, borderRadius: 34, borderWidth: 3.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', overflow: 'hidden', marginHorizontal: 4 },
  avatarImageLarge: { width: 60, height: 60, borderRadius: 30 },
  diceBoxWrapper: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative', marginHorizontal: 8, backgroundColor: 'rgba(15, 23, 42, 0.95)' },
  topRightPlayerWrapper: { position: 'absolute', top: 25, right: 10, zIndex: 100 },
  bottomLeftPlayerWrapper: { position: 'absolute', bottom: 25, left: 10, zIndex: 100 },
`;

// Replace old style references
code = code.replace(/avatarRingContainer: \{[^}]*\},/g, '');
code = code.replace(/avatarImage: \{[^}]*\},/g, '');
code = code.replace(/diceSpeechBubble: \{[^}]*\},/g, '');
code = code.replace(/heartsRow: \{[^}]*\},/g, '');
code = code.replace(/heartIcon: \{[^}]*\},/g, '');

const lastStyleIndex = code.lastIndexOf('});');
if (lastStyleIndex !== -1) {
  code = code.substring(0, lastStyleIndex) + newStyleRules + code.substring(lastStyleIndex);
}

fs.writeFileSync(filePath, code);
console.log('Successfully applied new dice design');
