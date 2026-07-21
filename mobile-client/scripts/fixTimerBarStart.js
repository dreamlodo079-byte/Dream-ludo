const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// Replace PlayerCard component with rotated timer bar and increased stroke visibility
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

  const perimeter = 260;
  const animatedDashoffset = animatedRatio.interpolate({
    inputRange: [0, 1],
    outputRange: [perimeter, 0],
  });
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : c.primary; 

  const renderDiceBubble = () => {
    const isLeft = align === 'right'; // If avatar is right, dice box is left (arrow on right)
    // Rotation to start stroke at arrow pointer position
    // For arrow on RIGHT (align === 'right'): start at middle-right (+135 deg)
    // For arrow on LEFT (align === 'left'): start at middle-left (-135 deg)
    const rotationAngle = align === 'right' ? 135 : -135;

    return (
      <View style={styles.diceBoxWrapper}>
        <Svg width={80} height={80} style={StyleSheet.absoluteFill}>
          {/* Background Track */}
          <Rect x={4} y={4} width={72} height={72} rx={17} ry={17} stroke="#334155" strokeWidth={4} fill="none" />
          {isActive && (
            <G transform={\`rotate(\${rotationAngle}, 40, 40)\`}>
              <AnimatedRect
                x={4}
                y={4}
                width={72}
                height={72}
                rx={17}
                ry={17}
                stroke={timerColor}
                strokeWidth={5.5}
                fill="none"
                strokeDasharray={perimeter}
                strokeDashoffset={animatedDashoffset}
                strokeLinecap="round"
              />
            </G>
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
}

fs.writeFileSync(filePath, code);
console.log('Successfully updated timer bar starting position and stroke width');
