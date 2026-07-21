const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Rewrite PlayerCardProps and PlayerCard component
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
  diceTransform,
}) => {
  const c = COLORS[color];
  const animatedRatio = useRef(new Animated.Value(turnTimer / totalTime)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isActive) {
      Animated.timing(animatedRatio, {
        toValue: Math.max(0, (turnTimer - 1) / totalTime),
        duration: 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      }).start();
      
      if (canRoll) {
        if (!loopRef.current) {
          loopRef.current = Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
              Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            ])
          );
          loopRef.current.start();
        }
      } else {
        if (loopRef.current) {
          loopRef.current.stop();
          loopRef.current = null;
        }
        pulseAnim.setValue(1);
      }
    } else {
      animatedRatio.setValue(1);
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
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
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : c.primary; 

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
        isActive && { borderColor: c.primary, backgroundColor: '#0F172A', borderWidth: 2 },
        !isActive && { borderColor: '#475569', backgroundColor: 'rgba(30, 41, 59, 0.6)', borderWidth: 1 },
        { transform: [{ scale: pulseAnim }] }
      ]}>
        <TouchableOpacity disabled={!canRoll} onPress={onRoll} activeOpacity={0.8} style={{alignItems: 'center', justifyContent: 'center', width: 44, height: 44}}>
          <Animated.View style={[
            { alignItems: 'center', justifyContent: 'center' },
            diceTransform ? { transform: diceTransform } : undefined
          ]}>
            <Dice value={diceValue} size={42} />
          </Animated.View>
        </TouchableOpacity>
        <View style={[styles.bubblePointer, 
          isLeft ? { right: -5, transform: [{rotate: '45deg'}] } : { left: -5, transform: [{rotate: '45deg'}] },
          isActive ? { backgroundColor: '#0F172A', borderColor: c.primary } : { backgroundColor: '#1E293B', borderColor: '#475569' },
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
        <View style={[styles.nameBadge, {backgroundColor: c.primary}]}>
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
        <View style={[styles.nameBadge, {backgroundColor: c.primary, marginTop: 4}]}>
          <Text style={styles.nameBadgeText}>{maskPhone(phone)}</Text>
        </View>
      )}
    </View>
  );
};

`;
  code = code.substring(0, playerCardStart) + newPlayerCard + code.substring(playerCardEnd);
} else {
  console.log('Failed to replace PlayerCard');
}

// 2. Add diceTransform to PlayerCard usages
const p1Start = code.indexOf('<PlayerCard\n              username={matchState.players[1]?.username || \'Player 2\'}');
if (p1Start !== -1) {
  code = code.replace(
    'avatarUri={require(\'../../assets/avatar.png\')}\n            />',
    'avatarUri={require(\'../../assets/avatar.png\')}\n              diceTransform={matchState.activePlayerIndex === 1 ? [{ scale: diceScale }, { rotate: rotZInterpolate }] : undefined}\n            />'
  );
}

const p2Start = code.indexOf('<PlayerCard\n              username={matchState.players[0]?.username || \'Player 1\'}');
if (p2Start !== -1) {
  code = code.replace(
    'avatarUri={require(\'../../assets/avatar.png\')}\n            />',
    'avatarUri={require(\'../../assets/avatar.png\')}\n              diceTransform={matchState.activePlayerIndex === 0 ? [{ scale: diceScale }, { rotate: rotZInterpolate }] : undefined}\n            />'
  );
}

fs.writeFileSync(filePath, code);
console.log('Successfully applied dice fixes');
