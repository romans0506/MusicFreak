// Hard music trivia about the biggest artists in the world — a verbatim copy of
// the web app's src/lib/music-trivia.ts bank (lines 10-226 there). Like
// lib/stats.ts and lib/itunes.ts this is a hand-copied port: no shared package
// exists between the two projects, so questions added on one side must be
// mirrored here or the two quizzes drift apart.
//
// AUTHORING RULE: options[0] is ALWAYS the correct answer. lib/games.ts
// shuffles the four options before handing them to the UI, so the order here
// doesn't leak the answer. Keep the three distractors plausible but
// unambiguously wrong, and keep all four option strings distinct.
//
// Dropped from the web copy: PHOTO_ARTIST / photoArtistFor(). Those resolve an
// artist photo through /v1/search, which needs the app token the device doesn't
// have — so the mobile quiz shows the "?" placeholder tile the web version
// falls back to for its spoiler-free questions. Nothing else differs.

export type TriviaQuestion = {
  id: string
  question: string
  /** [correct, wrong, wrong, wrong] — shuffled at serve time. */
  options: [string, string, string, string]
}

export const MUSIC_TRIVIA: TriviaQuestion[] = [
  // ── The Beatles ──
  { id: "beatles-1", question: "What was the name of John Lennon's skiffle group, the precursor to The Beatles?", options: ["The Quarrymen", "The Silver Tones", "The Blackjacks", "The Hep Cats"] },
  { id: "beatles-2", question: "Which was the last album The Beatles recorded together?", options: ["Abbey Road", "Let It Be", "The White Album", "Revolver"] },
  { id: "beatles-3", question: "What is Ringo Starr's real name?", options: ["Richard Starkey", "Richard Hopkins", "John Starkey", "Ringo Smith"] },
  { id: "beatles-4", question: "Which Beatle was the youngest member of the band?", options: ["George Harrison", "Paul McCartney", "Ringo Starr", "John Lennon"] },

  // ── Queen ──
  { id: "queen-1", question: "What was Freddie Mercury's birth name?", options: ["Farrokh Bulsara", "Faisal Hassan", "Frederick Bull", "Farid Bashir"] },
  { id: "queen-2", question: "On which island was Freddie Mercury born?", options: ["Zanzibar", "Cyprus", "Malta", "Sri Lanka"] },
  { id: "queen-3", question: "Queen's guitarist Brian May earned a PhD in which field?", options: ["Astrophysics", "Chemistry", "Mathematics", "Geology"] },
  { id: "queen-4", question: "\"Bohemian Rhapsody\" first appeared on which 1975 album?", options: ["A Night at the Opera", "News of the World", "Sheer Heart Attack", "A Day at the Races"] },

  // ── Michael Jackson ──
  { id: "mj-1", question: "Which Michael Jackson album is the best-selling album of all time?", options: ["Thriller", "Bad", "Off the Wall", "Dangerous"] },
  { id: "mj-2", question: "Michael Jackson rose to fame fronting which group with his brothers?", options: ["The Jackson 5", "The Temptations", "The Commodores", "The Supremes"] },
  { id: "mj-3", question: "At which 1983 TV special did Michael Jackson first perform the moonwalk?", options: ["Motown 25", "The Ed Sullivan Show", "Soul Train Awards", "American Bandstand"] },

  // ── Elvis Presley ──
  { id: "elvis-1", question: "What was Elvis Presley's middle name?", options: ["Aaron", "Allen", "Andrew", "Arthur"] },
  { id: "elvis-2", question: "What is the name of Elvis Presley's Memphis mansion?", options: ["Graceland", "Neverland", "Hartwood", "Briarcliff"] },

  // ── Madonna ──
  { id: "madonna-1", question: "What is Madonna's real surname?", options: ["Ciccone", "Veronese", "Moretti", "Russo"] },
  { id: "madonna-2", question: "Which 1989 Madonna album contains the title track \"Like a Prayer\"?", options: ["Like a Prayer", "True Blue", "Ray of Light", "Erotica"] },

  // ── Beyoncé & Jay-Z ──
  { id: "bey-1", question: "Beyoncé first rose to fame as the lead singer of which group?", options: ["Destiny's Child", "TLC", "En Vogue", "SWV"] },
  { id: "bey-2", question: "What is the name of Beyoncé's 2016 visual album?", options: ["Lemonade", "Renaissance", "B'Day", "4"] },
  { id: "bey-3", question: "Beyoncé is married to which rapper?", options: ["Jay-Z", "Nas", "Kanye West", "Diddy"] },
  { id: "jayz-1", question: "What is Jay-Z's real name?", options: ["Shawn Carter", "Curtis Jackson", "Andre Young", "Christopher Wallace"] },

  // ── Rihanna ──
  { id: "rih-1", question: "On which Caribbean island was Rihanna born?", options: ["Barbados", "Jamaica", "Trinidad", "The Bahamas"] },
  { id: "rih-2", question: "What is the name of Rihanna's cosmetics brand?", options: ["Fenty Beauty", "Rare Beauty", "Kylie Cosmetics", "Pat McGrath Labs"] },
  { id: "rih-3", question: "What was Rihanna's 2005 debut single?", options: ["Pon de Replay", "Umbrella", "S&M", "Disturbia"] },

  // ── Taylor Swift ──
  { id: "ts-1", question: "In which US state was Taylor Swift born?", options: ["Pennsylvania", "Tennessee", "Texas", "Ohio"] },
  { id: "ts-2", question: "What was Taylor Swift's 2006 debut single?", options: ["Tim McGraw", "Love Story", "Teardrops on My Guitar", "Our Song"] },
  { id: "ts-3", question: "What subtitle do Taylor Swift's re-recorded albums carry?", options: ["(Taylor's Version)", "(Re-Recorded)", "(The Vault)", "(Reclaimed)"] },
  { id: "ts-4", question: "Which 2014 album marked Taylor Swift's full move from country to pop?", options: ["1989", "Red", "Reputation", "Lover"] },

  // ── Drake ──
  { id: "drake-1", question: "On which Canadian teen drama did Drake first become known as an actor?", options: ["Degrassi: The Next Generation", "Heartland", "Riverdale", "Skins"] },
  { id: "drake-2", question: "What is Drake's first name?", options: ["Aubrey", "Marshall", "Cordae", "Jermaine"] },
  { id: "drake-3", question: "What is the name of Drake's record label and brand?", options: ["OVO Sound", "Cash Money", "Roc Nation", "Top Dawg"] },

  // ── Eminem ──
  { id: "em-1", question: "What is Eminem's real name?", options: ["Marshall Mathers", "Calvin Broadus", "O'Shea Jackson", "Nasir Jones"] },
  { id: "em-2", question: "What is Eminem's horror-themed alter ego?", options: ["Slim Shady", "Mr. Mathers", "Detroit Red", "Rabbit"] },
  { id: "em-3", question: "Eminem starred in which 2002 semi-autobiographical film?", options: ["8 Mile", "Get Rich or Die Tryin'", "Hustle & Flow", "Notorious"] },
  { id: "em-4", question: "Which producer discovered and mentored Eminem?", options: ["Dr. Dre", "Timbaland", "Rick Rubin", "Pharrell"] },

  // ── Kanye West ──
  { id: "ye-1", question: "What was Kanye West's 2004 debut album?", options: ["The College Dropout", "Late Registration", "Graduation", "808s & Heartbreak"] },
  { id: "ye-2", question: "Kanye West legally changed his name to what?", options: ["Ye", "Yeezus", "Mr. West", "Pablo"] },
  { id: "ye-3", question: "Kanye West's sneaker line was a partnership with which brand?", options: ["Adidas (Yeezy)", "Nike", "Puma", "Reebok"] },

  // ── Lady Gaga ──
  { id: "gaga-1", question: "What is Lady Gaga's real name?", options: ["Stefani Germanotta", "Katheryn Hudson", "Robyn Fenty", "Alecia Moore"] },
  { id: "gaga-2", question: "Lady Gaga won an Oscar for \"Shallow\" from which 2018 film?", options: ["A Star Is Born", "La La Land", "Bohemian Rhapsody", "Rocketman"] },
  { id: "gaga-3", question: "With which legendary jazz singer did Lady Gaga record two albums?", options: ["Tony Bennett", "Frank Sinatra", "Nat King Cole", "Harry Connick Jr."] },

  // ── Adele ──
  { id: "adele-1", question: "Which Adele album contains \"Rolling in the Deep\" and \"Someone Like You\"?", options: ["21", "19", "25", "30"] },
  { id: "adele-2", question: "Adele's Oscar-winning 2012 song was the theme to which James Bond film?", options: ["Skyfall", "Spectre", "No Time to Die", "Casino Royale"] },
  { id: "adele-3", question: "Adele's studio albums are each named after what?", options: ["Her age at the time", "A city", "A month", "A lover's name"] },

  // ── Ed Sheeran ──
  { id: "ed-1", question: "\"Shape of You\" appears on which Ed Sheeran album?", options: ["÷ (Divide)", "× (Multiply)", "+ (Plus)", "= (Equals)"] },
  { id: "ed-2", question: "Ed Sheeran names his albums after what kind of symbols?", options: ["Mathematical symbols", "Zodiac signs", "Roman numerals", "Playing-card suits"] },

  // ── Coldplay ──
  { id: "cold-1", question: "Who is the lead singer of Coldplay?", options: ["Chris Martin", "Thom Yorke", "Matt Bellamy", "Brandon Flowers"] },
  { id: "cold-2", question: "What was Coldplay's 2000 debut album?", options: ["Parachutes", "A Rush of Blood to the Head", "X&Y", "Viva la Vida"] },

  // ── U2 ──
  { id: "u2-1", question: "From which city does the band U2 come?", options: ["Dublin", "Manchester", "Glasgow", "Liverpool"] },
  { id: "u2-2", question: "By what stage name is U2's guitarist known?", options: ["The Edge", "Slash", "Flea", "Bono"] },

  // ── Nirvana ──
  { id: "nirv-1", question: "Which 1991 Nirvana album features \"Smells Like Teen Spirit\"?", options: ["Nevermind", "In Utero", "Bleach", "Incesticide"] },
  { id: "nirv-2", question: "Kurt Cobain was married to the frontwoman of which band?", options: ["Hole", "The Breeders", "Bikini Kill", "Garbage"] },
  { id: "nirv-3", question: "Nirvana's drummer went on to form which band?", options: ["Foo Fighters", "Pearl Jam", "Soundgarden", "Queens of the Stone Age"] },

  // ── Pink Floyd ──
  { id: "pf-1", question: "Which 1973 Pink Floyd album is one of the best-selling of all time?", options: ["The Dark Side of the Moon", "The Wall", "Wish You Were Here", "Animals"] },
  { id: "pf-2", question: "Which 1979 Pink Floyd rock opera spawned the film of the same name?", options: ["The Wall", "The Final Cut", "Meddle", "The Division Bell"] },

  // ── Led Zeppelin ──
  { id: "lz-1", question: "Who was the lead singer of Led Zeppelin?", options: ["Robert Plant", "Roger Daltrey", "Ozzy Osbourne", "Ian Gillan"] },
  { id: "lz-2", question: "Which Led Zeppelin epic is among the most famous rock songs ever?", options: ["Stairway to Heaven", "Paranoid", "Layla", "Free Bird"] },

  // ── Bob Dylan ──
  { id: "dylan-1", question: "What is Bob Dylan's real name?", options: ["Robert Zimmerman", "Robert Allen", "David Cohen", "Robert Hicks"] },
  { id: "dylan-2", question: "Bob Dylan won which unusual prize for a musician in 2016?", options: ["Nobel Prize in Literature", "Pulitzer Prize for Drama", "Booker Prize", "Turner Prize"] },

  // ── David Bowie ──
  { id: "bowie-1", question: "What was David Bowie's flamboyant 1972 alter ego?", options: ["Ziggy Stardust", "The Thin White Duke", "Aladdin Sane", "Major Tom"] },
  { id: "bowie-2", question: "What is David Bowie's real surname?", options: ["Jones", "Smith", "Bowes", "Stewart"] },
  { id: "bowie-3", question: "Bowie's 1969 breakthrough single was about which character?", options: ["An astronaut (Space Oddity)", "A soldier", "A sailor", "A spy"] },

  // ── Prince ──
  { id: "prince-1", question: "What was Prince's 1984 album and film of the same name?", options: ["Purple Rain", "Sign o' the Times", "1999", "Diamonds and Pearls"] },
  { id: "prince-2", question: "Which US city was Prince famously from and based in?", options: ["Minneapolis", "Detroit", "Chicago", "Atlanta"] },

  // ── Whitney Houston ──
  { id: "wh-1", question: "Whitney Houston's \"I Will Always Love You\" featured in which 1992 film?", options: ["The Bodyguard", "Waiting to Exhale", "The Preacher's Wife", "Sparkle"] },
  { id: "wh-2", question: "Who originally wrote \"I Will Always Love You\"?", options: ["Dolly Parton", "Carole King", "Diane Warren", "Whitney Houston"] },

  // ── Mariah Carey ──
  { id: "mc-1", question: "Which 1994 Mariah Carey song dominates the charts every December?", options: ["All I Want for Christmas Is You", "Hero", "Fantasy", "We Belong Together"] },
  { id: "mc-2", question: "Mariah Carey is especially known for hitting notes in which vocal range?", options: ["The whistle register", "The baritone register", "The chest voice", "Vibrato"] },

  // ── ABBA ──
  { id: "abba-1", question: "From which country is the band ABBA?", options: ["Sweden", "Norway", "Denmark", "Netherlands"] },
  { id: "abba-2", question: "ABBA won the 1974 Eurovision Song Contest with which song?", options: ["Waterloo", "Mamma Mia", "Dancing Queen", "SOS"] },

  // ── The Weeknd ──
  { id: "wknd-1", question: "What is The Weeknd's real name?", options: ["Abel Tesfaye", "Abel Makonnen", "Ahmed Balshe", "Adam Feeney"] },
  { id: "wknd-2", question: "\"Blinding Lights\" appears on which The Weeknd album?", options: ["After Hours", "Starboy", "Dawn FM", "Beauty Behind the Madness"] },

  // ── Bruno Mars ──
  { id: "bruno-1", question: "What is Bruno Mars's real name?", options: ["Peter Hernandez", "Bruno Martinez", "Marcus Bruno", "Peter Mars"] },
  { id: "bruno-2", question: "Bruno Mars formed the duo Silk Sonic with which artist?", options: ["Anderson .Paak", "Mark Ronson", "Cardi B", "Travis Scott"] },
  { id: "bruno-3", question: "In which US state was Bruno Mars born and raised?", options: ["Hawaii", "California", "Nevada", "Florida"] },

  // ── Justin Bieber ──
  { id: "jb-1", question: "Justin Bieber was discovered on YouTube by which manager?", options: ["Scooter Braun", "Simon Cowell", "Lou Pearlman", "Benny Blanco"] },
  { id: "jb-2", question: "Which country is Justin Bieber from?", options: ["Canada", "United States", "Australia", "United Kingdom"] },

  // ── *NSYNC / Justin Timberlake ──
  { id: "jt-1", question: "Before his solo career, Justin Timberlake was a member of which boy band?", options: ["*NSYNC", "Backstreet Boys", "98 Degrees", "New Kids on the Block"] },
  { id: "jt-2", question: "As a child, Justin Timberlake starred on which TV show alongside Britney Spears?", options: ["The Mickey Mouse Club", "Star Search", "Romper Room", "Kids Incorporated"] },

  // ── Britney Spears ──
  { id: "brit-1", question: "What was Britney Spears's 1998 debut single?", options: ["...Baby One More Time", "Oops!... I Did It Again", "Toxic", "Lucky"] },
  { id: "brit-2", question: "Britney Spears was under what legal arrangement until it ended in 2021?", options: ["A conservatorship", "A restraining order", "A gag order", "A trusteeship"] },

  // ── Spice Girls ──
  { id: "spice-1", question: "What was the Spice Girls' 1996 debut single?", options: ["Wannabe", "Spice Up Your Life", "Say You'll Be There", "Viva Forever"] },
  { id: "spice-2", question: "Victoria Beckham (Posh Spice) married which footballer?", options: ["David Beckham", "Wayne Rooney", "Ryan Giggs", "Frank Lampard"] },

  // ── BTS ──
  { id: "bts-1", question: "From which country is the group BTS?", options: ["South Korea", "Japan", "China", "Thailand"] },
  { id: "bts-2", question: "What is the official name of BTS's fandom?", options: ["ARMY", "BLINK", "ONCE", "STAY"] },
  { id: "bts-3", question: "How many members are in BTS?", options: ["7", "5", "6", "9"] },

  // ── Bob Marley ──
  { id: "marley-1", question: "Bob Marley performed with which backing band?", options: ["The Wailers", "The Maytals", "The Skatalites", "Black Uhuru"] },
  { id: "marley-2", question: "What is the title of Bob Marley's best-selling 1984 greatest-hits album?", options: ["Legend", "Exodus", "Kaya", "Survival"] },

  // ── Shakira ──
  { id: "shak-1", question: "Which country is Shakira from?", options: ["Colombia", "Mexico", "Spain", "Argentina"] },
  { id: "shak-2", question: "Shakira's official 2010 FIFA World Cup song was which track?", options: ["Waka Waka", "Hips Don't Lie", "Whenever, Wherever", "She Wolf"] },

  // ── Billie Eilish ──
  { id: "billie-1", question: "Billie Eilish's brother and main collaborator goes by what name?", options: ["Finneas", "Phoebe", "Conan", "Oscar"] },
  { id: "billie-2", question: "Billie Eilish sang the title song for which 2021 James Bond film?", options: ["No Time to Die", "Skyfall", "Spectre", "Quantum of Solace"] },

  // ── Ariana Grande ──
  { id: "ari-1", question: "On which Nickelodeon show did Ariana Grande get her start?", options: ["Victorious", "iCarly", "Drake & Josh", "Zoey 101"] },
  { id: "ari-2", question: "Which 2019 Ariana Grande album shares its name with a hit single about moving on?", options: ["thank u, next", "Sweetener", "Dangerous Woman", "Positions"] },

  // ── Harry Styles / One Direction ──
  { id: "hs-1", question: "Harry Styles rose to fame in which band formed on The X Factor?", options: ["One Direction", "The Wanted", "5 Seconds of Summer", "JLS"] },
  { id: "hs-2", question: "Which 2022 Harry Styles album features \"As It Was\"?", options: ["Harry's House", "Fine Line", "Harry Styles", "Pink"] },

  // ── Amy Winehouse ──
  { id: "amy-1", question: "What was the name of Amy Winehouse's acclaimed 2006 album?", options: ["Back to Black", "Frank", "Rehab", "Valerie"] },

  // ── Oasis ──
  { id: "oasis-1", question: "Which two famously feuding brothers led the band Oasis?", options: ["Liam and Noel Gallagher", "Tom and Ben Fletcher", "Chris and Jonny Lowe", "Mark and David Knopfler"] },

  // ── Radiohead ──
  { id: "radio-1", question: "Which band, fronted by Thom Yorke, released the 1997 album OK Computer?", options: ["Radiohead", "Muse", "Blur", "Pulp"] },

  // ── Phil Collins / Genesis ──
  { id: "genesis-1", question: "Phil Collins was the drummer and later frontman of which band?", options: ["Genesis", "Yes", "Rush", "Toto"] },

  // ── Sting / The Police ──
  { id: "police-1", question: "Sting was the lead singer of which band before going solo?", options: ["The Police", "The Clash", "The Jam", "The Cure"] },

  // ── Metallica ──
  { id: "met-1", question: "Metallica's self-titled 1991 album is popularly known as what?", options: ["The Black Album", "Master of Puppets", "Ride the Lightning", "Kill 'Em All"] },

  // ── AC/DC ──
  { id: "acdc-1", question: "Which country is the rock band AC/DC from?", options: ["Australia", "England", "United States", "Ireland"] },
  { id: "acdc-2", question: "Which 1980 AC/DC album is one of the best-selling of all time?", options: ["Back in Black", "Highway to Hell", "Thunderstruck", "Powerage"] },

  // ── Guns N' Roses ──
  { id: "gnr-1", question: "Who is the lead singer of Guns N' Roses?", options: ["Axl Rose", "Slash", "Sebastian Bach", "Vince Neil"] },
  { id: "gnr-2", question: "What was Guns N' Roses' 1987 debut album?", options: ["Appetite for Destruction", "Use Your Illusion I", "G N' R Lies", "Chinese Democracy"] },

  // ── The Beach Boys ──
  { id: "beach-1", question: "Which 1966 Beach Boys album, led by Brian Wilson, is hailed as a masterpiece?", options: ["Pet Sounds", "Surfin' USA", "Smile", "Surfer Girl"] },

  // ── Marvin Gaye ──
  { id: "marvin-1", question: "What was Marvin Gaye's landmark 1971 socially conscious album?", options: ["What's Going On", "Let's Get It On", "Midnight Love", "I Want You"] },

  // ── Snoop Dogg / Dr. Dre ──
  { id: "snoop-1", question: "Which producer crafted Snoop Dogg's 1993 debut album Doggystyle?", options: ["Dr. Dre", "DJ Quik", "Warren G", "Daz Dillinger"] },
  { id: "dre-1", question: "Dr. Dre was a founding member of which pioneering gangsta-rap group?", options: ["N.W.A", "Wu-Tang Clan", "Mobb Deep", "Bone Thugs-n-Harmony"] },
  { id: "dre-2", question: "Dr. Dre co-founded which headphone brand later sold to Apple?", options: ["Beats", "Bose", "Skullcandy", "JBL"] },

  // ── Tupac / Biggie ──
  { id: "pac-1", question: "Tupac Shakur was a flagship artist of which 1990s label?", options: ["Death Row Records", "Bad Boy Records", "Def Jam", "No Limit"] },
  { id: "big-1", question: "What is the real name of The Notorious B.I.G.?", options: ["Christopher Wallace", "Calvin Broadus", "Tupac Shakur", "Earl Simmons"] },
]
