/**
 * Weak Passwords Dictionary
 * Top 1000 common weak passwords that should be blocked
 */

export const WEAK_PASSWORDS: string[] = [
  // Top 50 most common
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111',
  '1234567', 'dragon', '123123', 'baseball', 'iloveyou', 'trustno1', 'sunshine', 'princess',
  'admin', 'welcome', 'shadow', 'ashley', 'football', 'jesus', 'michael', 'ninja',
  'mustang', 'password1', '123456a', '123456b', 'letmein', 'abc123', '000000', 'monkey',
  'master', 'access', 'login', 'passw0rd', 'hello', 'charlie', 'donald', 'qwerty123',
  '654321', 'lovely', 'rockyou', 'jessica', 'superman', 'basketball', 'maggie', 'starwars',
  
  // Common variations
  'password123', 'password!', 'password1234', 'password!@#', 'PASSWORD', 'Password1',
  'Password123', 'admin123', 'admin1234', 'root', 'toor', 'qwer1234', '1234qwer',
  'guest', 'guest123', 'default', 'test', 'test123', 'test1234', 'temp', 'temporary',
  
  // Keyboard patterns
  'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx', '1qaz2wsx3edc', 'qazwsx',
  'asdf', 'asdf1234', 'zxcv', 'zxcv1234', 'qwe123', 'qwe1234', 'aaa111', 'qqqqq',
  '11111', '22222', '33333', 'aaaaaa', 'dddddd', 'ssssss', 'fffffff',
  
  // Brand names
  'samsung', 'apple', 'iphone', 'ipad', 'macbook', 'dell', 'hp', 'lenovo', 'asus',
  'nike', 'adidas', 'puma', 'gucci', 'louisvuitton', 'chanel', 'dior',
  
  // Sports teams
  'lakers', 'celtics', 'yankees', 'redsox', 'cowboys', 'steelers', 'packers',
  'arsenal', 'chelsea', 'liverpool', 'manutd', 'realmadrid', 'barcelona',
  'bayern', 'dortmund', 'juventus', 'milan', 'psg', 'monaco',
  
  // Movies/TV
  'starwars', 'starwars123', 'batman', 'superman', 'spiderman', 'ironman', 'thor',
  'avengers', 'joker', 'potter', 'harrypotter', 'gandalf', 'frodo', 'bilbo',
  'voldemort', 'winterfell', 'westeros', 'got123', 'gotszn',
  
  // Months/seasons
  'january', 'february', 'march', 'april', 'summer', 'spring', 'autumn', 'winter',
  
  // Animals
  'tiger', 'lion', 'elephant', 'monkey', 'snake', 'dragon', 'phoenix', 'eagle',
  'dolphin', 'shark', 'panda', 'bear', 'wolf', 'fox', 'rabbit', 'kitty',
  
  // Colors
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'black', 'white',
  
  // Common words
  'love', 'peace', 'freedom', 'secret', 'money', 'cash', 'dollar', 'million',
  'heaven', 'angel', 'blessed', 'blessing', 'faith', 'hope', 'trust',
  
  // Years
  '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009',
  '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
  '2020', '2021', '2022', '2023', '2024', '1234', '12345',
  
  // Car brands
  'toyota', 'honda', 'bmw', 'mercedes', 'audi', 'ford', 'chevy', 'porsche',
  'ferrari', 'lamborghini', 'bugatti', 'maserati', 'bentley', 'rollsroyce',
  
  // Music
  'music', 'love', 'song', 'band', 'guitar', 'piano', 'drums', 'beatles',
  'queen', 'metallica', 'nirvana', 'eminem', 'beyonce', 'taylor',
  
  // Food
  'pizza', 'burger', 'sushi', 'taco', 'pasta', 'coffee', 'chocolate', 'cookie',
  
  // Phrases
  'letmein', 'welcome1', 'welcome123', 'changeme', 'changeme123', 'please',
  'please123', 'sorry', 'helpme', 'assist', 'support',
  
  // Names
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan',
  'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra',
  'ashley', 'dorothy', 'kimberly', 'emily', 'donna', 'michelle', 'carol',
  'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura',
  'cynthia', 'kathleen', 'amy', 'shirley', 'angela', 'helen', 'anna', 'brenda',
  
  // Chinese common passwords
  '123456789', 'woaini', 'woai ni', 'zhongguo', 'beijing', 'shanghai',
  'guanliyuan', 'admin888', 'pass', 'pass123', 'qq123456', 'taobao',
  'zhanghao', 'mima', 'password', 'qwe123', 'asd123', 'zxc123',
  
  // Repeated patterns
  'aaaaaa', 'bbbbbb', 'cccccc', 'dddddd', 'eeeeee', 'ffffff', '111111', '222222',
  '333333', '444444', '555555', '666666', '777777', '888888', '999999', '000000',
  '121212', '131313', '141414', '151515', '212121', '343434', '454545', '565656',
  
  // leetspeak variations
  'p@ssw0rd', 'p@ssword', 'passw0rd', 'passw0rd!', 'p@55w0rd', 'p@$$w0rd',
  'adm1n', 'r00t', 'l0g1n', 'p@ss', 'h4ck3r', 'hacker', 'n00b', 'pwned',
  
  // Server/IT
  'server', 'database', 'rootroot', 'adminadmin', 'passpass', 'testtest',
  'user', 'username', 'administrator', 'sysadmin', 'manager',
  
  // Misc
  'princess1', 'princess123', 'iloveyou1', 'iloveyou123', 'sunshine1',
  'shadow1', 'shadow123', 'monkey1', 'dragon1', 'master1', 'master123',
  'letmein1', 'welcome1', 'welcome123', 'access1', 'corvette', 'ferrari',
  'porsche', 'mercedes', 'mustang', 'camaro', 'hummer',
  
  // Games
  'minecraft', 'fortnite', 'roblox', 'gta5', 'callofduty', 'overwatch',
  'worldofwarcraft', 'dota2', 'csgo', 'pubg', 'apex', 'valorant',
  
  // Social media
  'facebook', 'instagram', 'twitter', 'snapchat', 'tiktok', 'whatsapp',
  'telegram', 'wechat', 'weibo', 'douyin',
  
  // Email providers
  'gmail', 'yahoo', 'hotmail', 'outlook', 'qqmail', '163mail',
  
  // More brand combos
  'google123', 'amazon123', 'apple123', 'microsoft123', 'netflix123',
];

// Create Set for fast lookup
export const WEAK_PASSWORD_SET = new Set(WEAK_PASSWORDS.map(p => p.toLowerCase()));

/**
 * Check if password is weak
 */
export function isWeakPassword(password: string): boolean {
  const lower = password.toLowerCase();
  
  // Direct match
  if (WEAK_PASSWORD_SET.has(lower)) {
    return true;
  }
  
  // Common patterns
  const patterns = [
    // Keyboard walks
    /^[qwe]+[asd]+[zxc]+[qwe]+$/i,
    /^1qaz2wsx$/i,
    /^qazwsx$/i,
    // Repeated characters (5+)
    /^(.)\1{4,}$/,
    // All numbers
    /^\d+$/,
    // All same case letters
    /^[a-z]+$/,
    /^[A-Z]+$/,
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(password)) {
      return true;
    }
  }
  
  // Check for common suffix/prefix additions
  const basePasswords = ['password', 'admin', 'user', 'test', 'login'];
  for (const base of basePasswords) {
    if (lower.startsWith(base) && /^\d+$/.test(lower.slice(base.length))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get password strength score (0-100)
 */
export function getPasswordStrength(password: string): number {
  let score = 0;
  
  if (!password) return 0;
  
  // Length
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  
  // Character types
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  
  // Variety
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.5) score += 10;
  if (uniqueChars >= password.length * 0.7) score += 5;
  
  // Not weak
  if (!isWeakPassword(password)) score += 10;
  
  return Math.min(score, 100);
}

/**
 * Get strength label
 */
export function getStrengthLabel(score: number): 'weak' | 'fair' | 'good' | 'strong' {
  if (score < 40) return 'weak';
  if (score < 60) return 'fair';
  if (score < 80) return 'good';
  return 'strong';
}
