const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// Replace PlayerCard component with custom Path to perfectly control start position
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
  
  // At ratio=1 (start), offset=0 -> full path visible.
  // At ratio=0 (end), offset=perimeter -> gap starts at 0, grows clockwise. Visible line shrinks towards the end of the path (which is back at the arrow).
  const animatedDashoffset = animatedRatio.interpolate({
    inputRange: [0, 1],
    outputRange: [perimeter, 0],
  });
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : c.primary; 

  const renderDiceBubble = () => {
    const isLeft = align === 'right'; 
    
    // Custom SVG paths to start exactly at the arrow
    const rightAlignPath = "M 76 40 L 76 59 A 17 17 0 0 1 59 76 L 21 76 A 17 17 0 0 1 4 59 L 4 21 A 17 17 0 0 1 21 4 L 59 4 A 17 17 0 0 1 76 21 Z";
    const leftAlignPath = "M 4 40 L 4 21 A 17 17 0 0 1 21 4 L 59 4 A 17 17 0 0 1 76 21 L 76 59 A 17 17 0 0 1 59 76 L 21 76 A 17 17 0 0 1 4 59 Z";
    const pathData = isLeft ? rightAlignPath : leftAlignPath;

    return (
      <View style={styles.diceBoxWrapper}>
        <Svg width={80} height={80} style={StyleSheet.absoluteFill}>
          {/* Background Track */}
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
console.log('Successfully applied precise SVG Path for timer animation');
