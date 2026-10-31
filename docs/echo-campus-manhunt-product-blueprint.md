# ECHO
## Scan the campus. Build the arena. Play the real world.

**Working title:** ECHO. Naming and trademark availability have not been checked.  
**First world:** BITS Pilani, K. K. Birla Goa Campus.  
**Version:** 2.0 / 30 October 2026.  
**Product:** a real-world multiplayer game and a scan-to-play world-building platform.  
**Audience:** players, collaborators, technical reviewers, and a student founder preparing an OpenAI Studio Hours showcase. This is a proposed showcase, not a claim of sponsorship or campus approval.

> **The vision:** walk through campus with a phone, capture its real spaces, reconstruct a recognizable spatial world, and publish verified parts as a playable manhunt arena. Unmapped space stays outside the game. The campus becomes a world the community can build, maintain, and play inside.

ECHO has two connected loops. **Build the world:** capture, reconstruct, align, verify, and publish. **Play the world:** hunt, evade, use information powers, activate mapped landmarks, and outthink friends across real routes. A GPS-map demo proves the multiplayer loop first; it is not the definition or technical ceiling of the finished product.

This document assumes the founder can code and is willing to build technically demanding systems. The target architecture includes native sensor capture, visual-inertial tracking, photogrammetry and RGB-D reconstruction, geographic registration, map compilation, streaming assets, visual localization, authoritative multiplayer, and versioned world updates. Complexity is justified by a product requirement, not avoided because this is a student project.

**How to read:** 01-02 establish the vision and actual manhunt-app references; 03-08 specify roles, a baseline rulebook, powers, and a match; 09-10 define the scan-to-world product and rendering model; 11-16 specify experience and trust; 17-24 cover expansion, scope, evaluation, roadmap, and showcase; 25 contains primary sources; the final section, 26, contains the complete technology and implementation specification.

**Evidence legend:** **Documented** means a cited primary source describes the feature. **Design decision** is the proposed ECHO behavior. **Engineering hypothesis** requires a prototype or measurement. **Target** is a goal, not a proven capability. **Research option** is an evaluated branch, not an installed dependency. The map illustrations are schematic: no current BITS Goa survey, scan, access approval, or application implementation has been completed by this document.

The PDF contains the same specification as the Markdown plus designed concept plates. The Markdown is self-contained and editable; the PDF is suitable for circulation and technical review.

---

# 01. The product: a campus you can build into a game

ECHO begins with real-world manhunt: friends divide into hunters and runners, move around a bounded space, receive timed information, collect abilities, and resolve catches. That core already exists in several apps. ECHO's intended contribution is the **world beneath the chase**: an environment captured on foot, reconstructed from evidence, compiled into a recognizable playable arena, and maintained by its community.

Imagine opening the creator view at BITS Goa. Most of the campus is dark, labelled **unmapped / outside play**. You walk an authorized path while the camera records overlapping views and the phone logs motion and coarse geographic references. The screen shows tracking quality, observed surfaces, route coverage, and missing views. A courtyard begins to appear as a provisional spatial model. After processing and review, that patch becomes a published district with simplified 3D architecture, known paths, exclusions, and persistent landmark IDs.

Now eight friends load that published world. On their screens, it is a tilted miniature of the place around them, built from their own captures. A hunter's scan travels through verified route branches. A runner deploys a decoy along a route that actually exists. A landmark relay powers an information exchange. Outside verified coverage, the map dissolves into a clear non-playable boundary rather than silently falling back to "anywhere with GPS is fair game."

This is a **playable spatial twin**, deliberately narrower than a claim of a complete live digital twin. It contains enough observed geometry, topology, semantics, and current operational state to support a game. It does not pretend to know what is behind an unobserved wall or remotely watch everything happening on campus.

## 01.1 The two product loops

| Loop | What the user does | What ECHO produces | Why it creates value |
| --- | --- | --- | --- |
| Build | Walk, capture, revisit gaps, align landmarks, review | Evidence-backed world chunks and an approved playable mask | The arena becomes specific to the real place |
| Play | Hunt, hide, route-plan, activate powers, confirm catches | A tactical multiplayer round using that world | Mapping changes the actual decisions, not just the scenery |
| Maintain | Rescan changed areas, report closures, verify patches | New world versions and operational restrictions | The world remains usable as the campus changes |
| Extend | Connect another verified district or another campus | A larger arena graph and reusable rules | The same platform supports new places without an app fork |

Mapping and chasing are separate modes. The creator intentionally uses the camera while walking or stopped; the player can keep the camera off during ordinary chase. High-quality mapping does not imply that every player must stream video continuously.

## 01.2 The product promise

**To players:** "Play your actual campus, with routes and landmarks that matter."

**To creators:** "Walk a place into the game. See what is missing. Publish only what is verified."

**To collaborators:** "Build a pipeline that turns physical observations into spatial assets and enforceable multiplayer rules."

The short pitch is: "ECHO is a real-world manhunt game where you build the arena by scanning it. We start with a GPS multiplayer demo, then turn BITS Goa into a progressively captured 3D-style world. Unmapped regions stay outside play, and powers use the mapped paths, landmarks, and information network. The platform can later bring that same scan-to-play workflow to other campuses and venues."

## 01.3 What 'real time' means here

There are four different update loops. **Capture preview** updates locally as the creator moves. **Reconstruction** improves asynchronously as chunks are processed. **Gameplay state** updates during a round. **World maintenance** records newly observed changes and publishes revised geometry. They have different latency, sensing, and verification requirements.

A phone can show a live local mesh or coverage preview while scanning on supported hardware. That does not mean a complete high-quality campus model is reconstructed instantly. A published scan can depict the campus as last observed; it cannot reveal a new crowd, moved scooter, or closed door after the scanner has left. New observations or explicit reports are needed. The precise contracts and pipeline are specified later, rather than hiding all of these promises behind the phrase "real-time map."

## 01.4 Ambition and sequencing

The first demo is intentionally a GPS map with real participants, timed pings, and a small rules set. The flagship is a spatial creation platform with a real game attached. These are different milestones in the same architecture. Preserve the long-term world model from the first data contracts so the demo can grow without treating its temporary basemap as permanent truth.

The strongest proof of the vision is a closed loop: record an actual permitted campus patch, process it, show it appearing as a recognizable world chunk, approve its play area, and run a match using that exact chunk. A generic map demo proves only the chase. An attractive scan viewer proves only reconstruction. ECHO needs both connected.

# 02. Existing manhunt apps: the baseline ECHO must beat

The user is right: the underlying game is already a product category, including apps promoted through social video. Without the actual reel link, it is not possible to identify that particular app conclusively. **Hunting Game: GPS Manhunt**, linked from hunting-game.com, is a close mechanical reference. It should be studied directly rather than treating board games or generic location-sharing as the primary comparison.

## 02.1 Primary references and documented mechanics

| Product | Identity and source | Documented loop | Relevance to ECHO |
| --- | --- | --- | --- |
| Hunting Game: GPS Manhunt | hunting-game.com; App Store ID 6471968553 [S24, S25] | Host sets a play zone and timing; chasers receive runner updates; runners use a chaser compass; catches use a code | The closest reference for the baseline GPS chase |
| Manhunt IRL | manhuntgame.com; App Store ID 6817872685 [S26] | Fuzzy pings, proximity heartbeat, jail/jailbreak, confirmed tags, replay; browser players keep screens on | Information uncertainty, social recovery, and low-friction joining |
| SCRAM: Hide and Seek | Google Play package com.scram.app [S27] | Head start, periodic age-labelled pings, team visibility, in-person tagging, configurable play zone | A clear presentation of the chase loop |
| Hunting Game: Manhunt | Jacob Schubert; App Store ID 6809603844 [S28] | Radar/compass presentation, six listed powers, multiple modes and match replay | A separate similarly named product; useful power/HUD reference |

The first and fourth entries are different listings. Do not combine their features, pricing, downloads, or release notes. Websites and store listings can also disagree by version; record the build actually tested. This document does not claim to have installed or played these apps, and it does not repeat marketing download counts as independently verified evidence.

## 02.2 How Hunting Game's loop works

The official rules describe a private lobby, assigned roles, a drawn Play Zone, configurable timing, and readiness checks. Chasers follow released positions; runners evade them using a compass. A chaser obtains the nearby runner's catch code and enters it to record a no-touch catch. Catch everyone before time expires or leave at least one runner uncaught at the deadline [S25].

Its role-specific powers include runner Stealth and Map, chaser Scan and Decoy, and shared Blackout [S24, S25]. For ECHO, that means timed information, temporary concealment, extra reveals, and decoys are established category features. A longer list of power-ups alone is not a strong differentiation claim.

The reference creates tension by separating what the phone knows from what each role receives. ECHO should preserve that useful pattern while making the physical environment part of the computation. For example, a scan can ask which verified route branches are nearby, rather than simply releasing every GPS point in a circle.

## 02.3 What to learn from the other references

Manhunt IRL adds a stronger social loop through jail and rescue, approximate disclosures, and a proximity warning. SCRAM makes the age of a ping part of the player's understanding. The separate Jacob Schubert listing demonstrates that radar styling, decoys, jamming, and thermal-style reveals are also being explored [S26-S28]. These observations support a category baseline, not a claim that any one mechanic is exclusive to a product.

The reviewed pages do not establish that any competitor provides ECHO's entire proposed workflow of creator capture, georeferenced reconstruction, evidence-backed playable coverage, and world compilation. That is an opportunity hypothesis to test with hands-on competitor research, not proof that no such product exists anywhere.

## 02.4 The differentiation must change gameplay

| Baseline genre capability | ECHO's intended extension | Observable proof |
| --- | --- | --- |
| Draw a boundary on an existing map | Publish a boundary from verified captured coverage and route review | Unknown patch remains unplayable until approved |
| Put GPS markers over a map | Display a compiled stylized world derived from campus scans | A captured landmark is recognizable in the rendered arena |
| Circle-based extra ping | Graph Sweep, district relays, and topology-aware objectives | The same radius can produce different legal-route results |
| Place a generic pickup | Attach a persistent station to an approved physical landmark | Station survives a re-render through stable landmark identity |
| Static map setup | Evidence, revisions, closure reports, and patch refresh | Changed path invalidates dependent objectives before republishing |
| Replay a route | Optional abstract replay inside an approved world version | Correct geometry and consent persist independently of raw route retention |
| One-off match | Community world-building plus recurring matches | Contributors can extend a district without rewriting game code |

ECHO's moat would be the quality of its local spatial data, the reliability of scan-to-play publishing, the arena compiler, and the community that maintains it. A sophisticated rendering algorithm alone is not a defensible product if the routes are wrong or creators cannot publish an arena.

## 02.5 Hands-on reference study before implementation locks

Run one supervised round in at least the closest available reference app. Record the actual platform/build, installation friction, lobby flow, role visibility, information cadence, physical catch convention, ability targeting, background behavior, disconnect recovery, battery change, and post-game retention explanation. Ask the same participants to try ECHO's GPS demo on a comparable arena and compare specific decisions.

Use a screen recording only with consent and keep live join codes and other people's coordinates out of public material. Document observed behavior separately from the marketing page. The goal is to discover what existing apps already do well and where the scanned-world loop adds value, not to create a superficial feature checklist.

## 02.6 A product thesis strong enough for the ambition

The creative direction is **a living, authored game world made from a real campus**. The scanner is an authoring tool; the compiler decides what may become playable; the renderer makes the place legible; the referee controls the multiplayer round. These are complementary systems. The rest of this specification describes how to connect them without confusing visual plausibility with physical truth.

# 03. Players, roles, and jobs to be done

## 03.1 Primary users

**The organizer:** wants to gather six to ten friends, explain the rules once, start without technical troubleshooting, and resolve exceptions without becoming a full-time referee.

**The runner:** wants suspense, agency, a chance to outthink a faster friend, understandable danger, and a reason to move instead of hiding in one inaccessible corner.

**The hunter:** wants useful leads, satisfying deductions, occasional tactical tools, and a believable path to catching someone rather than wandering at random.

**The participant with a weaker phone:** wants an honest readiness check and a mode that does not secretly disadvantage them because their device misses alerts or reports poor GPS.

**The world creator:** wants to capture campus spaces on foot, understand scan gaps, produce a recognizable world chunk, and submit evidence-backed play regions. **The maintainer/reviewer:** wants alignment reports, independent appearance/coverage/access overlays, stable landmarks and a controlled publication process.

**The event steward:** wants an obvious pause control, a roster, connection status, an audit trail for rulings, and a way to close a dangerous path. A student host and steward can be the same person during a tiny test; a larger event should separate them.

## 03.2 Session roles

| Role | Can do | Cannot do by default |
| --- | --- | --- |
| Runner | Move inside the arena, collect runner items, use powers, acknowledge capture | See exact hunter locations or other runners' live coordinates |
| Hunter | Receive scheduled disclosures, scan, collect hunter items, request captures | Read raw runner location history |
| Host | Configure and start rounds, approve roster, pause/resume, record rulings | Secretly reveal opponent locations while playing |
| Steward | Handle disputes and approved safety escalation | Use privileged knowledge to coach a team |
| Captured player | See their result, go to the meeting point, leave safely | Spectate live opponent locations or relay tracking information |
| Spectator | See a timer and team-level progress in a later release | Receive a live pursuit map |
| World creator | Capture permitted spaces, propose geometry and inspected routes | Convert every camera-visible surface into permitted territory |
| World maintainer / reviewer | Validate evidence, access, topology and publish versions | Secretly expand an active match or reveal live player locations |

## 03.3 Core session assumptions

Start with adult, known participants in a private invite-only group. A pilot needs permission to use its play area, consent to active-round location collection, an accessible meeting point, weather suitable for outdoor movement, and working mobile data. The app must support a walking format as a different preset. It should never advertise the default chase as equally suitable for all mobility needs.

The organizer knows the campus; the app does not assume it knows every open gate, temporary closure, staircase, or safe shortcut. Those are field-verification tasks.

# 04. A complete first-play rulebook

## 04.1 Calibration preset: Classic Signals

Classic Signals is the baseline GPS/demo and calibration mode. Signal Districts is the separate spatial flagship specified in section 06.10. The GPS demo uses a temporary manually surveyed permit mask; the flagship requires compiled verified coverage, and unknown regions remain outside play.

All values below are **pilot values**. A host chooses a published preset before the lobby locks. Do not let hosts tune twenty sliders on their first game.

| Parameter | Starting value | Why start here |
| --- | --- | --- |
| Players | 8 total: 2 hunters, 6 runners | Enough social interaction without a large event burden |
| Supported small pilot | 6-10 players; about 1 hunter per 3 runners | Test ratios rather than assuming a universal balance |
| Briefing | About 3 minutes | Explain arena, capture, stop behavior, and phone alerts |
| Head start | 60 seconds | Runners disperse; hunters stay at the start point |
| Chase | 18 minutes, excluding head start and pauses | Short enough to repeat and compare |
| Scheduled runner pulse | Every 90 seconds of chase time | Creates repeated decisions without continuous tracking |
| Snapshot presentation | Bright for 12 seconds; muted last-seen marker for at most 90 seconds | Distinguish a reveal event from its aging evidence |
| Spatial presentation | 25 m grid cell, enlarged for location uncertainty | Coarse tactical information rather than false precision |
| Runner start inventory | 1 Freeze each | Everyone can learn the signature mechanic |
| Hunter start inventory | 1 Sweep each | Hunters have one discretionary lead |
| Inventory capacity | 2 items total, duplicate limit 1 per type | Simple choices; no stockpiles |
| Stations | Initially 4-6 approved outdoor stations | Keep mapping and steward workload small |
| Station respawn | 120 chase seconds after a claim | A reason to revisit without constant camping |
| Pickup collection | 3-second stopped interaction inside the permitted station area | Gives the opponent a meaningful opportunity |
| Capture | Verbal call within roughly 3 m, clear line of sight, two-sided confirmation | Avoid automatic GPS catches and physical contact |
| Match end | All runners captured, or chase clock expires | Immediately understandable objective |

The map and permitted movement area must be small enough for these values to create encounters. Do not scale the whole campus into the first round merely because the basemap covers it. Select a compact, verified outdoor sub-area based on a real walking survey. There is no invented arena size claim here.

## 04.2 Before the lobby opens

The host selects an arena version, approved hours, the preset, meeting point, and steward. Players see the boundary and exclusions before joining. The host checks closures and weather immediately before play. The app displays which information each role will receive and when tracking stops.

Every player completes a short readiness check: location permission, a sufficiently recent fix, an alert/haptic test, connectivity, and a practical battery check. A proposed entry threshold is 30% battery for a short pilot, but a real device test should determine the recommendation. A player failing the alert test can use a walking, screen-visible supervised test; they should not silently join an alert-dependent chase.

The host assigns teams manually or uses a transparent randomizer. The group can rotate hunters after each round. Lock the roster and rules before the start so nobody can join mid-chase and inspect a team.

## 04.3 Head start and chase clocks

During the 60-second head start, runners can move within bounds. Hunters remain at the designated start point by agreement. There are no location pulses, ability uses, captures, or station claims during this phase. The app gives a distinct final countdown, then starts the 18-minute chase.

The first pulse occurs at chase 01:30, then 03:00, 04:30, and so on. The last is at 16:30; the 18:00 deadline ends the match before any pulse at that same instant. Server deadlines decide timing. A device timer is a display of that clock, never its authority.

Pauses stop chase time, effect time, station respawns, pulse deadlines, and item cooldowns. After a resume, pending intervals retain their remaining duration. Wall-clock timestamps still record what happened. There is no banking a delayed command during a pause.

## 04.4 Movement and interaction

Players can walk or run only where the arena permits. Roads, vehicles, roofs, restricted entrances, residence interiors, construction, water edges, and other excluded spaces are outside play even if a GPS point appears inside the outer polygon. A mapped building is visual context, not permission to enter.

Using an item, collecting a station, or confirming a capture requires the player to stop somewhere safe. The UI says this directly. It must not demand typing, camera aiming, or precise taps while moving. Running with the phone held up to read the map is not part of the intended loop.

The game does not physically enforce a freeze or prevent someone running. It enforces eligibility for game actions and records acknowledgements; players agree to the physical rules.

## 04.5 Capture without GPS arguments

The default is a **no-touch call-and-confirm capture**. A hunter must be close enough for an ordinary verbal call, approximately 3 m, with clear line of sight and no barrier. The hunter calls the runner's alias. Both stop safely. The hunter selects the runner; the runner confirms the encounter using a short-lived challenge presented on the hunter's screen, or a later QR variant.

The 3 m convention is a human rule, not a claim that phone GPS measures that distance reliably. Being on the other side of a wall, on another floor, or seeing a dot near another dot is not a capture. No grabbing, tackling, blocking someone physically, or taking their phone.

A capture request lasts up to 15 wall-clock seconds while the match is running. Both participants observe a local stand-down during confirmation; they cannot use powers, claim stations, or create additional capture requests in that encounter. The rest of the match continues. If confirmed, the server records the capture and clears the runner's active inventory. If either side contests it or the request expires, both remain in stand-down and a steward pauses or rules on the encounter. The app does not auto-award a catch because someone failed to tap.

A pending capture request has no scoring effect. Time expiry wins if the confirmation has not been accepted by the server before the chase deadline. For the pilot, do not backdate catches based on unverifiable client timestamps. Explain this rule before play.

## 04.6 Winners, withdrawal, and fairness

Hunters win a complete round by capturing every runner. Runners win as a team if at least one eligible runner survives at the deadline. Show individual captures and survival time as secondary stats. Rewarding speed alone would work against tactical play.

A player can leave immediately. Withdrawal is not a capture, does not earn hunter points, and is visibly marked. A round affected by a withdrawal is a **practice result**, not a complete competitive result. If all remaining runners are caught but another withdrew, label it "round incomplete" rather than "all captured." If the last eligible hunter withdraws, end the round incomplete. If the last uncaptured runner loses connection, pause and resolve the connection; do not convert that failure into either team's victory.

The initial release has no ranked ladder. Trust, uneven devices, and small campus cohorts make it premature.

## 04.7 What captured players do

A captured player goes to the meeting point using permitted routes, with location tracking stopped for gameplay. They see a static round summary, the shared timer, and safety controls. Their map does not suddenly unlock the positions of friends still hiding. They must not scout for hunters or reveal information through the app.

Later modes can provide an explicit rescue mechanic or delayed non-location mini-game. The default has neither. Keep the first round short enough that being captured early is not a twenty-minute spectator punishment.

# 05. The information economy

## 05.1 Exactly who sees what

| Information | Runner | Hunter | Playing host | Separate steward |
| --- | --- | --- | --- | --- |
| Own location and accuracy | Yes | Yes | Own role only | Own location if relevant |
| Arena, exclusions, public stations | Yes | Yes | Yes | Yes |
| Runner's continuous coordinates | Own only | No | No | No routine live view |
| Scheduled runner pulse | Own disclosure notice | All eligible runner snapshots | Role-based only | Event record, not unrestricted map |
| Sweep result | Warning if included | Using hunter only | Role-based only | Minimal audit if disputed |
| Hunter's exact position | No | Own only | Role-based only | No routine live view |
| Freeze target eligibility | Roster status only | Own status | Role-based only | Operational status |
| Captured / disconnected count | Yes | Yes | Yes | Yes |
| Raw personal route replay | Off | Off | Off | Off |

Hunter teammates can communicate verbally. Their live coordinates are not shared in the pilot. Adding that feature later requires an explicit disclosure and can make coordinated hunting substantially stronger.

## 05.2 Scheduled pulses

A pulse is a server-generated snapshot using the latest acceptable location at that moment. It is not a 12-second live stream. The hunter sees a coarse cell, alias, measurement time, and age. Once the bright 12-second window ends, the same evidence becomes a muted last-seen marker and expires 90 seconds after disclosure. It never follows the runner between pulses.

A runner gets a clear countdown before a pulse and a notice when revealed. This creates an intentional decision: relocate just before a pulse, remain where the hunter expects, or make a risky station run. Do not add invisible random ping delays in the first release.

If a runner's location is too old or too uncertain, the pulse says "signal unavailable" for that runner. It does not substitute an old dot as if fresh. The operational rules in section 14 prevent deliberate disconnection from becoming a hiding strategy.

## 05.3 Accuracy, age, and coarse cells

The starting disclosure cell is 25 m. If reported accuracy is worse than this but still inside the mode's permitted limit, enlarge the region rather than implying a narrow cell. For the first pilot, require reported horizontal accuracy of 25 m or better and an accepted measurement age of at most 10 seconds for normal powers and pulse disclosures. Those are engineering starting values, not guarantees about campus reception.

Grid cell boundaries should remain stable for an entire arena version. Never generate a different random offset on each reveal that can be averaged into a precise location. Use a consistent local metric coordinate system for quantization and render the uncertainty area, not a sharp pin at the cell center. The server keeps the authoritative measured point separate from the disclosed cell.

The reported accuracy value is itself an estimate. It does not establish a hard containment guarantee or prove location authenticity. UI copy should say "approximate area" rather than "runner is definitely inside this square."

## 05.4 Information must be absent from the payload

Do not send all raw player positions to every phone and hide the markers with frontend code. Do not put them in shared presence metadata, analytics, notification bodies, debugging overlays, or a downloadable replay file. The correct recipient view must be built on the server. This is part of the game rules as much as a security requirement.


## 05.5 World information is not opponent information

The approved play mask, unknown regions, exclusions, public route graph and required operating instructions are common knowledge. Role-based signals are private projections inside that world. Do not transmit secret player positions inside a public world asset, hidden shader buffer, scan-debug layer or localization response. A visual localization service sees an explicitly requested query under a separate policy; it is not a covert continuous opponent-tracking service.

Graph-based queries also disclose information. Bound their frequency, share the original measurement age, and test whether repeated sectors or branch results can be combined into unintended precise tracking. A coarse map style alone does not prevent inference.

# 06. Power-ups, counterplay, and balance

## 06.1 Ability vocabulary

A **power** is an inventory item with a server-side instance ID. A **station** is a verified map location that offers role-appropriate items. A **cooldown** limits repeated use over chase time. A **telegraph** tells the affected person an action is happening. A **counter** is an understandable response, not an obscure exception.

Only **Freeze** and **Sweep** belong in the first outdoor slice. The larger catalogue below explores the product's headroom. Introducing all of it together would make balance and learning much harder.

## 06.2 Freeze: signature runner ability

**Fantasy:** create one short opportunity to change direction, leave a visible area, or escape a hunter's line of sight.

**Pilot parameters:** single use; targets one named hunter from the public roster; no distance requirement; 8-second freeze after safe-stop acknowledgement; 45-second immunity after it ends; 5-second acknowledgement offer; one pending offer per target. Global targeting is deliberate: runners do not receive a secret hunter-location feed merely to choose a target.

**Cost and risk:** on successful activation, both hunters receive the caster's fresh coarse location snapshot. The freeze buys time while revealing where it came from. The target roster may show "available," "immune," or "temporarily unreachable" without coordinates.

**Resolution:**

1. A stopped runner selects a hunter and confirms. The server validates both states, the caster's fresh location, immunity, and inventory, then reserves the item.
2. The hunter receives an offer with a distinct alert: "Freeze incoming. Stop safely, then acknowledge." The runner sees "waiting for acknowledgement," not "hunter frozen."
3. Before acknowledgement, ordinary play continues; the hunter is not yet physically frozen. A valid capture already accepted first can make the caster ineligible and cancel the offer.
4. The hunter stops safely and acknowledges within 5 seconds. The server revalidates, consumes the item, starts an 8-second deadline, and commits the caster disclosure. The target cannot capture, scan, or claim stations while frozen.
5. During the freeze, the hunter remains safely stationary but may look at already-disclosed map information. When the authoritative deadline passes, the app gives an end cue and starts 45-second immunity.
6. If no acknowledgement arrives, release the reservation without consuming the item or revealing the caster. Disable repeated immediate retries for 10 chase seconds and flag the incident. A connected hunter repeatedly ignoring an offer triggers a steward pause; no automatic accusation or points penalty.

A delivered alert does not prove that a human heard it. The acknowledgement is an explicit social contract. GPS can suggest movement anomalies but cannot reliably prove an eight-second violation. A campus pilot must establish whether this mechanic feels fair before it becomes a central competitive promise.

A freeze received while the hunter is crossing a road means "reach the nearest safe stopping point," never "stop in traffic." Safety pauses override gameplay. No ability may hide that control.

## 06.3 Sweep: signature hunter ability

**Fantasy:** spend a scarce scan to test a hypothesis about where runners might be.

**Pilot parameters:** 100 m radius centered on the hunter's latest acceptable position; one snapshot; result visible brightly for 8 seconds, then ages under the same 90-second maximum; 60-second personal scan cooldown; one stored Sweep at a time. Scanning consumes an item when a valid scan executes, even when it finds no runners.

A clearly in-range runner is disclosed as an approximate cell with an age label. A runner at an uncertain boundary produces an anonymous "possible signal near scan edge" indicator. A runner with an unusable fix contributes to a "signals unavailable" count rather than a false "nobody nearby" assertion. Only the using hunter gets the result; included runners get "you were scanned." Other hunters learn nothing automatically.

If the hunter's fix is unusable, reject without spending. If every remaining runner's signal is unusable, return "scan unavailable" without spending. If some are usable, execute, spend, and show the partial-data status. A valid scan finding zero usable in-range signals says "no confirmed signals in range," not "area clear."

Sweep does not see through walls in the capture sense. A scan can locate an approximate outdoor area across an obstruction, but a catch still needs an actual permitted encounter. The UI does not draw a straight-line route through buildings toward a target.

## 06.4 Station collection rules

Stations are fixed approved outdoor patches, not virtual items spawned randomly on someone else's doorstep. Each has one public availability state, a stable ID, an item table, and a chase-time respawn deadline. A runner sees the runner reward and a hunter the hunter reward. The first successful claim consumes that station for everyone until respawn; the server resolves simultaneous claims.

For a GPS station, start with a collection patch roughly 15-20 m across, verified in the field and away from exclusions. Require two acceptable readings over the three-second stopped hold. If GPS cannot distinguish the station from a nearby prohibited space, move the station or use a steward-controlled checkpoint. Enlarging a radius across a wall is not a fix.

If inventory is full, the player chooses which item to replace before beginning the hold. The choice locks for that attempt. Claim and inventory replacement are one atomic server action. A losing simultaneous claimant gets "already collected" and loses nothing. Do not reveal the collector's identity or path through global station notifications.

## 06.5 Expanded runner catalogue: later experiments

| Power | Proposed effect | Cost, warning, and counterplay | Release |
| --- | --- | --- | --- |
| Cloak | Suppress one scheduled pulse for its owner | Must activate at least 5 seconds before pulse; hunters see "cloaked" instead of a fake outage; never blocks Sweep | V2 |
| Echo Decoy | Add one clearly game-origin decoy signal at a recently visited approved cell | Never an arbitrary dropped GPS point; revealed as decoy after expiry; one active per runner | V2 |
| Smoke Screen | Hide a runner's alias on their next scheduled disclosure, retaining the area | Hunters still receive real spatial information; cannot combine with Cloak | V2 |
| Signal Delay | Delay the owner's next scheduled disclosure by 15 seconds | Original sample time stays visible; cannot turn an old sample into a fresh one | Lab |
| Scanner Ward | Block the next Sweep disclosure of this runner for 30 seconds | Hunter receives "one signal shielded"; does not block scheduled pulses | V2 |
| Relay | Transfer one held item to a teammate at an approved station | Both stop and confirm; no remote inventory teleportation | V2 |
| Breadcrumb | Privately mark a safe route or rendezvous for teammates | Shared planning only; grants no enemy-location knowledge | V2 |
| Rescue Token | Free one captured teammate at a published rescue checkpoint | Separate rescue mode; visible event; prevents default-rule confusion | Mode-specific |
| Noise Lure | Create a temporary map-only disturbance at a visited station | Never mimics a safety alert or emits real distress audio | Lab |
| Last Stand | One final short Freeze available only in a declared endgame preset | Announced before the round; no hidden comeback rule | Mode-specific |

## 06.6 Expanded hunter catalogue: later experiments

| Power | Proposed effect | Cost, warning, and counterplay | Release |
| --- | --- | --- | --- |
| Wide Sweep | Larger radius with coarser disclosure | Choose range or precision; never both | V2 |
| Focus Scan | Smaller radius with normal coarse cells | Requires a stronger location hypothesis; still no exact dot | V2 |
| Bearing | Approximate sector toward nearest eligible runner | Return uncertain/no reliable bearing as needed; avoid continuous compass tracking | Lab |
| Trail Read | Reveal one past disclosed cell for a selected runner | Clearly historical; consumes item even if the lead is stale | V2 |
| Station Watch | Notify the owner once if a named station is claimed | No identity or raw coordinate; expires after a short interval | V2 |
| Pulse Advance | Bring the next global pulse forward slightly | Everyone gets warning; shifts one event rather than stacking extra pulses | Lab |
| Decoy Filter | Identify one currently visible decoy as artificial | Does not reveal the real runner; cannot scan empty map globally | V2 |
| Brace | Cancel one incoming Freeze offer during a short prepared window | Must be armed in advance; runner gets item back if countered | Lab |
| Relay Link | Share one already-authorized Sweep result with another hunter | No new location query; original sample age remains visible | V2 |
| Objective Jam | Delay a runner objective's claim window briefly | Objective modes only; no interference with safety or connectivity | Mode-specific |

No product should launch with every row enabled. These are design options with different information costs. The first set of additional experiments should be Cloak, Decoy, and Decoy Filter, tested one at a time.

## 06.7 Interactions and hard limits

A target can have one Freeze offer or active freeze at a time. Frozen hunters cannot be re-frozen; immunity begins when the effect ends. No inventory action is allowed during capture stand-down. Items cannot be activated while disconnected, in a pause, outside the playable area, after elimination, or during head start.

A later Cloak blocks only the scheduled pulse, while Ward blocks only a Sweep. A combined loadout must never make a player invisible to all information channels for long periods. A Decoy must never impersonate a real user's current exact location or suppress their consent status. No power affects safety messages, steward controls, accessibility settings, or the connection health UI.

For simultaneous actions, server order is decisive: scheduled deadlines and state transitions due at a timestamp are processed first; then validated commands are ordered by receipt and a per-match sequence. At the exact match end, the round ends. At the exact pulse timestamp, a last-millisecond Cloak is too late. An accepted capture removes eligibility for later Freeze acknowledgement. Duplicate requests return the original outcome.

## 06.8 Balance as a measurable process

Start by testing pulses and manual captures without stations. Then enable Freeze. Then add Sweep. Only after the group understands these should stations be introduced. Keep one fixed map and one preset during a comparison. Record capture times, power-use outcomes, signal failures, repeat-play interest, and short qualitative explanations.

Do not balance only toward a 50% team win rate. A round can be mathematically close and still miserable if one hunter spends most of it frozen or a runner hides without decisions. Monitor time without useful leads, early-capture waiting time, repeated station camping, and whether slower players have meaningful choices.

Never secretly change odds during a round. If a preset needs adaptation, publish it between rounds and let everyone see what changed.


## 06.9 Powers that only make sense in a mapped world

The baseline catalogue teaches the genre. The flagship catalogue should exploit ECHO's spatial model. Each ability declares whether its distance is Euclidean, route-graph distance, district adjacency, or a deliberate game abstraction. A wall in the scanned world does not automatically make phone-GPS capture reliable.

| Ability | Spatial dependency | Proposed behavior | Main technical / balance test |
| --- | --- | --- | --- |
| Graph Sweep | Verified route graph | Spend a scan to reveal eligible signals within a route-distance budget | Ambiguous player-to-graph matching must yield uncertain results |
| Junction Echo | Named junction and connected branches | Reveal an anonymous recent branch-level trace, not a continuous location | Avoid reconstructing exact paths through repeated cheap queries |
| Relay Tap | Persistent approved landmark node | Activate a relay to earn team network progress or one bounded information advantage | Stopped claim, robust landmark identity, no spoof-proof promise |
| District Jam | Explicit digital relay graph | Temporarily block relay information across one network edge | It never blocks a physical path or a safety message |
| Path Decoy | Approved graph and a previously visited origin | Move an artificial signal along a physically possible verified route | It cannot travel through an unknown hole or across a wall |
| Anchor Shift | Two approved stations with published rules | Move a virtual objective's attachment between known anchors | No physical teleportation and no hidden rule relocation |
| Blind Corner | Reviewed occlusion proxy, deliberately coarse signal regions | Reduce one information disclosure around a named static obstruction | Treat as game fiction; pose uncertainty can invalidate the test |
| Beacon Link | Two maintained landmarks and their permitted connection | Create a short-lived team information circuit | Do not encourage station crowding or camera use during running |
| Signal Bridge | Digital network edge within already approved coverage | Restore a jammed relay link once | Never enables an unmapped physical route |
| Survey Ghost | Replayed approved route template | Leave a decoy trace consistent with that world version | Avoid replaying a real person's retained private route |
| District Lock | Mode-defined information boundary | Limit a scan to one district or suppress cross-district identity | It changes information, not access permissions |
| Cartographer's Cache | Published mapping contribution and approved station | Cosmetic creator reward or a fair, preset objective location | Mapping contribution never buys stronger paid combat powers |

These are concrete spatial-mechanics research branches. They are not all mandatory for the first release. The most valuable early pair is **Graph Sweep + Path Decoy**, because both visibly depend on the compiled world rather than on a branded basemap.

## 06.10 A flagship mode: Signal Districts

Classic Signals remains the calibration mode. **Signal Districts** is the first flagship mode built around the scanned campus. Two hunters pursue six runners for a proposed 20-minute chase after a 60-second head start. Runners must activate three different relays, spanning at least two published districts, then complete an extraction. The map compiler supplies five suitable relay candidates and two approved extraction patches, all connected through verified routes.

Each relay activation requires a six-second stopped claim. A relay contributes once to shared runner-team progress; repeatedly camping it yields no extra keys. Progress is public. Each successful activation also discloses the activator's approximate cell to both hunters, bright for 8 seconds and then aging under the normal 90-second last-seen limit. This is an explicit risk cost, declared before the round. Reaching three relays opens both extraction options for up to three minutes, bounded by the original 20-minute deadline. One active runner completing a five-second extraction claim wins for the runners. Hunters win by capturing everyone or preventing extraction before the deadline. These conditions differ from Classic Signals and must be displayed as a separate preset.

The two extraction options reduce the inevitability of a single camped exit. District relays and graph-based scan reach create meaningful route choices. A hunter can spend Graph Sweep on a connected branch, and a runner can deploy a Path Decoy along another legal route. Jamming changes the relay's information behavior, never the physical route or the published boundary.

This mode needs additional objective and state-machine testing, not just a different title. Captured players are eliminated in its initial rules; rescue is a separate later variant. A closure that disconnects a required objective triggers a pause and either a previously declared fallback or cancellation, not an improvised unsafe route.

# 07. Modes and how they change the product

| Mode | Win condition | Why it might work | Main design risk |
| --- | --- | --- | --- |
| Signal Districts | Activate relays across verified districts, then extract | Makes topology and landmarks central | Objective reachability and relay camping |
| Cartographer Survey | Capture and improve permitted world coverage; no chase | Creates the world-building community loop | Quality, review and permissions must outrank upload volume |
| Classic Signals | Hunters catch all; one survivor beats the clock | Clearest first experience | Static hiding and early elimination |
| Last Signal | Individual survival ranking in a short round | Simple social competition | Encourages selfish camping; avoid early ranking |
| Extraction | Runners activate two public objectives, then reach a timed exit | Forces movement and creates a readable finale | Exit camping and exclusion-sensitive paths |
| Infection | Captured runners become hunters after a reset interval | Keeps everyone active | Snowballing team imbalance |
| Rescue | Captured runners can be freed at a known checkpoint | Team coordination and comeback moments | Loops and jail camping |
| Relay Hunt | Teams move a virtual baton between approved checkpoints | Cooperative route planning | Requires strong transfer confirmation |
| Walking Signals | Walking-only format with longer clues and no pursuit sprinting | Lower physical intensity and easier phone use | Honest rule enforcement and accessible routing |
| Campus Quest | Non-pursuit waypoint discovery on the same map | Orientation, club events, map reuse | A different product loop needing separate validation |
| Organizer Event | Several small matches on coordinated arenas | Scales social participation | Steward load and overlapping groups |

**Recommended sequence:** Classic Signals for calibration; Signal Districts plus Graph Sweep/Path Decoy for the spatial flagship; Walking Signals and Campus Quest as distinct variants. Mapping and chasing remain separate modes. Infection is exciting but materially changes every visibility, inventory, and team-membership rule; it is not a free configuration toggle.

Do not implement a battle-royale circle that pressures players through roads, locked gates, or unsafe bottlenecks. If an endgame is needed, announce an approved rendezvous objective, allow generous travel time, and end a round if conditions change. Real terrain cannot be reshaped like a video game level.

# 08. One complete example round

The following is a fictional match on a schematic outdoor arena, not a claim about verified paths at BITS Goa. Times are chase time except where marked.

| Time | Event | What players understand |
| --- | --- | --- |
| Before start | Eight friends join. Mira and Dev are hunters; six are runners. Host verifies alerts and exclusions. | Everyone knows the capture rule and sees the same preset. |
| Head start 00:00-01:00 | Runners disperse from the meeting point. Hunters wait. | There are no powers or pings yet. |
| Chase 00:00 | Hunters are released. | The round clock reads 18:00 remaining. |
| 01:30 | First pulse reveals approximate runner cells. | Mira sees R3 near a schematic courtyard, sampled two seconds ago. |
| 01:42 | Bright pulse markers become muted. | The map says "last seen 12s ago"; it does not track R3. |
| 02:10 | Dev uses Sweep at a path junction. | One confirmed signal and one uncertain edge signal appear; the scanned runner is warned. |
| 02:20 | R3 activates Freeze on Mira and stops to send it. | R3 sees "pending"; Mira hears the offer. |
| 02:22 | Mira safely stops and acknowledges. | Mira is frozen until 02:30; both hunters see R3's caster disclosure. |
| 02:30 | Freeze ends; Mira gains immunity until 03:15. | A second runner cannot chain-freeze her. |
| 03:00 | Scheduled pulse occurs normally. | Freeze did not change the global pulse schedule. |
| 04:05 | Dev calls a valid no-touch capture on R5. | Both stop and confirm; R5 is captured at 04:09. |
| 05:10 | Two players attempt the same station. | First valid committed claim wins; the other loses no item. |
| 07:20 | A runner's accepted location becomes stale. | Their own phone warns them. Others see an unavailable signal rather than a fake position. |
| 07:30 | Staleness reaches the pause threshold. | The whole match pauses; no one keeps chasing during a known fault. |
| Resume | The host resolves the connection and restarts from the same chase time. | Remaining timers and inventories are preserved. |
| 16:30 | Last scheduled pulse. Two runners remain. | Hunters must choose how to use their final information. |
| 18:00 | One runner remains uncaptured. | Runners win the complete round; no pulse at the deadline is emitted. |

The best conversation after this round is about decisions: "I thought you would go back to that station," "I wasted the scan," or "your freeze revealed the route I was covering." If the conversation is instead about vanished pings and arbitrary captures, improve reliability and rules before adding powers.


## 08.1 The same idea on a captured world

In a fictional Signal Districts match, the published world has two reviewed districts, five relay candidates, two extraction patches and a dark unmapped courtyard extension. Runners must reach three relays across both districts. A runner and hunter are 40 m apart across a structure but 160 m apart through the approved graph, so a 100 m Graph Sweep does not report a confirmed route-range signal. A Path Decoy follows a verified branch toward one relay rather than clipping through that structure.

The runners activate a third relay; both extraction options open, bounded by the match deadline. One hunter covers the shorter approved route while the other spends a scan on the alternate branch. The unmapped extension remains unavailable to everyone even if it would create a faster escape. A later report of a closed gate pauses play and invalidates the affected connection rather than silently rerouting players.

All geometry and events in this example are illustrative. Its purpose is to show decisions that depend on a captured, compiled world rather than on a generic GPS background.

# 09. Scan-to-world: building the campus by walking it

## 09.1 The creator experience

The creator opens **Survey Mode**, chooses a permitted district, and sees unknown space in graphite. A camera view is paired with a miniature coverage map. The app asks for a slow loop through an authorized path, additional views of selected landmarks, and a return past a recognizable anchor. It records evidence and shows what is actually being observed.

As the creator walks, tracked surfaces appear as wireframe or points where the device supports them. A ground-level route ribbon records the inspected corridor separately. A building seen across a lawn may contribute to the appearance model while the lawn itself remains outside play. A reconstruction progress card shows registration and upload state. Gaps are actionable: "revisit this facade from another angle," "tracking lost here," or "this junction has no verified connection."

After processing, the creator sees a 3D preview and an independent playable-mask editor. They verify paths, exclusions, accessibility, operating restrictions, and station patches. A second reviewer can inspect the evidence before publication. The resulting district is added to a world version; existing matches retain their pinned version.

The emotional payoff is tangible: **I walked that space, and now it exists inside our game.** That payoff should survive every technical compromise made along the pipeline.

## 09.2 A walk trace, a scan, and a playable region are different

| Evidence | What it can establish | What it cannot establish by itself |
| --- | --- | --- |
| GPS walk trace | Approximate traveled route and geographic context | Building shape, precise path width, permission, or accurate 3D geometry |
| Camera images / video | Visual appearance and multi-view constraints | Hidden surfaces, metric scale without extra constraints, or walkability |
| Camera pose + IMU | Local motion/scale priors when tracking is sound | Drift-free campus-wide geographic alignment |
| Depth / LiDAR on supported devices | Local surface observations and useful geometry | A complete building from one viewpoint or a current access decision |
| Surveyed control / verified anchor | A reference for alignment and repeat localization | Permission for the surrounding region |
| Reviewer approval | Operational decision about known evidence and permitted use | Perfect sensing or immunity to future closures |

A camera ray reaching a wall is not a walk through the wall. A visited path does not scan an entire surrounding building. Mesh hole-filling does not prove that a bridge or doorway exists. The product must preserve these distinctions in both its UI and its data model.

## 09.3 Capture methods worth supporting

**RGB plus visual-inertial capture is the broad baseline.** Record keyframes, camera intrinsics, timestamps, local poses, and coarse GNSS priors. Visual-inertial tracking produces a useful local frame while later image matching can improve consistency. An ordinary RGB-only photo sequence can also feed a reconstruction pipeline, with explicit scale and alignment controls.

**Depth-assisted capture is a quality tier.** On supported Apple hardware, ARKit scene reconstruction provides local mesh observations; ARCore's Depth API provides depth on supported Android devices, using motion and optionally hardware depth [S29, S30]. They are different provider capabilities. Do not assume every Android depth phone exposes an ARKit-like mesh, or that every participant needs a LiDAR phone.

**Photogrammetry is the dense reconstruction route for ordinary imagery.** Structure-from-Motion recovers cameras and sparse structure; multi-view stereo estimates denser geometry [S31]. ECHO adds its own registration, quality, privacy, semantics, and publishing stages around that process.

**360-camera or professional survey input is an advanced import path.** It can improve coverage and consistency but is not required for the first world chunk. Drone capture is a separate permission, access, and operational decision; it is not silently assumed for a campus student project.

## 09.4 Capture guidance and field procedure

Start with a small permitted outdoor patch and a few stable landmarks, not one uninterrupted campus-wide recording. Use short overlapping sessions, revisit shared features, and close loops where practical. Give each session an explicit beginning, ending, device calibration record, and tracking-quality timeline.

Capture from different positions, not only by rotating in one spot. Prefer stable lighting and textured surfaces; treat shiny glass, repeating corridors, blank walls, moving foliage, crowds, and fast camera motion as known failure cases. Keep the device's camera and stabilization settings consistent within a calibration group. Do not infer unobserved roofs from a ground-level walk.

The creator gets a live quality dashboard: blur warnings, tracking-loss markers, keyframe spacing, observed-surface coverage, route-inspection coverage, and anchor status. These are measured diagnostics and heuristics, not a single magical "98% scanned" score. Explain which area the percentage refers to.

## 09.5 Three independent maps of confidence

A district needs **observation coverage**, **geometric quality**, and **operational approval**. Do not compress them into a binary scanned/unscanned flag.

| Axis | Example states | Why it remains independent |
| --- | --- | --- |
| Observation | UNKNOWN, OBSERVED, STALE_OBSERVATION | Has this area or surface actually been captured? |
| Reconstruction | NONE, PREVIEW, REGISTERED, QA_PASSED, FAILED | Is the geometry coherent and aligned enough for the intended use? |
| Play approval | NOT_REVIEWED, APPROVED, RESTRICTED, CLOSED | Is play permitted here under current rules and conditions? |
| Publication | DRAFT, REVIEWED, PUBLISHED, SUPERSEDED | Which artifact set may clients and matches use? |

A well-reconstructed hostel facade can remain restricted. A safe reviewed corridor can be playable with a simple proxy representation while its neighboring facade is still visually incomplete. A newly closed gate can revoke play immediately even though its scan remains excellent.

For the flagship, **unmapped means not playable**. The GPS demo has a temporary manually surveyed permit mask, visibly labelled as demo data. That exception does not redefine the mature coverage contract.

## 09.6 The playable-mask rule

The published play area is the intersection of verified traversable coverage, operational approval, permitted hours, and a connected route component, minus exclusions and closures. Camera-visible surfaces alone are excluded from the traversable-coverage input. The compiler also rejects routes whose uncertainty or width is inappropriate for the chosen mode.

In conceptual form: `PLAYABLE = VERIFIED_TRAVERSABLE_COVERAGE intersect APPROVED_ACCESS intersect ACTIVE_WINDOW intersect CONNECTED_COMPONENT minus EXCLUSIONS minus CLOSURES`.

Unknown holes remain holes. No broad outer polygon is allowed to bridge them automatically. A shortest path cannot cross an unobserved gap simply because two scanned patches look close from above. A map editor may correct boundaries only with evidence and a review trail.

Do not mathematically erode every narrow path by the worst imaginable phone-GPS radius and then pretend the entire campus is unusable. Keep world-boundary accuracy and live player-location uncertainty as separate quantities. Near an edge, the app can show **location uncertain** and suspend fine-grained eligibility rather than falsely declaring the player outside. Design broad collection patches and safe margins; use deliberate visual/anchor checks for genuinely precise interactions.

## 09.7 The minimum publishable chunk

A publishable chunk includes registered geometry/proxies, observed-coverage metadata, reviewed walkable surfaces, route connectivity, exclusions, stable landmarks, a coordinate transform, source provenance, QA results, inspection date, and asset hashes. A pretty mesh without a valid route graph is a preview, not an arena.

The first demonstration chunk should contain one recognizable landmark, a short verified loop, a station, an unknown hole, and an explicit exclusion. That combination demonstrates all of the central claims without requiring a complete campus before the product exists.

## 09.8 Collaborative mapping and ownership

Multiple students can contribute overlapping sessions. Contributions are proposals until aligned and reviewed. Keep the author, device capability, observation time, licence/permission basis, processing version, and confidence attached to the evidence. Use a district maintainer for conflict resolution and a reviewer for publication.

Reward useful coverage and verified corrections, not sheer footage volume. A duplicate scan with no added views is not equal to repairing a missing junction. Do not turn mapping into a race to enter restricted or unapproved space. Exploration quests happen only in permitted survey areas; they do not grant access rights.

## 09.9 Maintenance and change detection

A rescan can propose differences such as an added barrier, removed structure, changed path surface, or relocated landmark. Compare registered evidence with similar viewing geometry and account for lighting, vegetation, temporary people, and pose error. A model-generated difference is a candidate, not an automatic campus fact.

Distinguish geometry changes, appearance changes, and operational reports. A closed gate report may disable an edge immediately through a restricted closure overlay. A new opening does not automatically create a playable route. A revised mesh can change the appearance layer without changing the route graph.

During a match, new geometry never silently expands the arena. Pin the base world version. A safety-relevant closure can restrict it through a visible pause and signed closure revision. Ordinary updates publish between rounds.

## 09.10 What a campus walk cannot promise

Ground-level scanning cannot capture every roof, hidden courtyard, indoor room, undercut, or current moving object. Local SLAM can drift. Depth and image matching can fail. A visually completed model can contain invented surfaces if processing fills holes. ECHO's quality comes from keeping those uncertainties explicit and compiling only verified play affordances, while still allowing ambitious reconstruction and rendering research.

# 10. From captured reality to a recognizable game world

## 10.1 The visual target

The finished map should feel like a miniature campus assembled from the place itself. A recognizable facade, path bend, canopy, wall, courtyard, and landmark silhouette give it identity. It can be stylized rather than photorealistic, but its topology and spatial relationships must come from evidence.

The main play view is a tilted 2.5D/3D diorama with readable ground paths, selective detail, and a controlled camera. At closer zoom, selected scanned landmarks can retain textured detail. At district scale, the same world collapses to simplified masses and a clear route network. Unknown space has a deliberate visual treatment rather than an empty default basemap.

This is not simply extruding publicly available building polygons and calling the result a scanned campus. Extrusions are a useful demo representation and a low-detail fallback; the flagship's world chunks are derived from the capture pipeline and carry observation and quality metadata.

## 10.2 One world, several representations

| Representation | Contents | Primary use | Authority |
| --- | --- | --- | --- |
| Evidence archive | Keyframes, sensor metadata, depth where available, provenance | Reprocessing, verification, localization reference creation | Evidence, not direct gameplay rules |
| Reconstruction master | Registered point clouds, meshes, camera solutions | Geometry QA and derivative generation | Candidate geometry |
| Appearance layer | Textured meshes, stylized proxies, optional Gaussian splats | Recognition, presentation, world browsing | Never permission to move |
| Play layer | Verified mask, route graph, exclusions, station patches, landmark IDs | Server validation and in-game route information | Published rules authority |
| Localization layer | Anchors, reference features, alignment transforms, quality bounds | Stopped visual relocalization and map alignment | Evidence for pose with uncertainty |
| Live overlay | Participants' authorized signals, timers, relay state, closures | Current match | Server-authoritative and recipient-filtered |

This separation lets ECHO improve visual fidelity without changing a match's rules, or close a path without destroying the historical scan. It also means an impressive Gaussian-splat viewer cannot accidentally become the collision or permitted-area database.

## 10.3 Meshes, photogrammetry, and Gaussian splats

A textured mesh is a useful primary representation because it can be simplified, partitioned, given materials, and inspected geometrically. A low-poly proxy can be derived from observed geometry and artist-reviewed abstractions. The renderer should preserve the landmarks players actually recognize rather than spending equal detail on every triangle.

Gaussian splatting is worth a serious prototype for captured-world presentation and the reveal moment. The original 3DGS work is a radiance-field rendering method, not a turnkey game-navigation pipeline [S34]. For ECHO, a splat is an appearance asset. Maintain a separate verified geometric proxy for ray queries, path constraints, and station placement. Real-time rendering of a trained asset does not mean instant reconstruction or universal mobile performance.

A hybrid is the recommended flagship direction: **geometry and semantics for play, stylized tiled meshes for the default tactical view, selective splats or detailed meshes for world browsing and showcase views**. This retains the scanned character of the world while keeping action screens legible.

## 10.4 Automatic stylization as a world compiler stage

The pipeline can estimate ground and dominant surfaces, segment candidate static structures, simplify geometry, extract outlines, and generate consistent materials. A reviewer then corrects important landmarks and gameplay boundaries. Preserve provenance from each output back to the supporting capture and processing job.

Possible treatments include flat-shaded architecture, reduced texture palettes, baked shadows that do not obscure paths, contour edges, simplified vegetation, and a small set of landmark-specific detail meshes. Distinguish a schematic canopy from a confirmed physical obstruction. Do not allow a generated decorative facade, invented doorway, or mesh hole-fill to introduce a legal path.

For each district, maintain a visual identity sheet: recognizable silhouettes, dominant materials, label priorities, nickname aliases, and the minimum detail needed to distinguish similar buildings. The visual system is consistent across campuses while each world still looks local.

## 10.5 Coverage fog and gameplay fog

**Coverage fog** is shared: unknown or unapproved regions are outside play for everyone. **Gameplay fog** is role-specific: it limits opponent information inside the playable world. They must not use the same visual language.

Unknown regions use charcoal, coarse crosshatch, a hard boundary, and an UNMAPPED / OUTSIDE PLAY label. Captured but unpublished areas use a dotted wireframe in creator mode and remain unavailable in play mode. Published play areas use solid ground treatment. Closed regions retain context but gain a clear red hatch and disabled-route marks.

An old runner signal uses a faded cyan area and a timestamp, never the unmapped-space pattern. A player cannot use Cloak to conceal an exclusion or turn an unknown region into a valid hiding place. Unknown areas are a world-authoring boundary, not a secret personal advantage.

## 10.6 Streaming and levels of detail

Divide the world into content-addressed chunks. The manifest references appearance LODs, play geometry, localization assets, and their transforms. Preflight downloads the exact approved arena's rules geometry and enough appearance data to start. Stream optional high detail by camera view and device budget.

The legal mask and route graph must not arrive after a player has already moved into an area. Missing decorative textures can degrade to proxy geometry. Missing authoritative geometry prevents the round from starting or entering that district. This is a semantic distinction, not merely a loading spinner choice.

Use a local metric render frame and floating-origin handling if the world grows. Keep global coordinates in higher precision outside the renderer. Budget geometry, texture memory, draw calls, shader cost, and thermal load separately. A phone running background location and alerts is not a desktop scan viewer.

## 10.7 Optional augmented-reality interactions

AR is valuable at deliberate stopped interactions: inspect a captured landmark, relocalize against its reference, activate a persistent station, or reveal a district relay. It is not the default pursuit UI. The camera can turn off once the interaction finishes.

Offer a non-camera fallback where the mode can support it; otherwise declare the station's device requirement before the round. Never quietly give better-scanning hardware a stronger competitive information feed. The scanner's capabilities and the participant's capabilities are different product tiers.

Indoor or multi-floor modes are a separate spatial problem. They require explicit floor/region identity, verified vertical connectors, and a localization method that can disambiguate levels. GPS altitude is not a floor detector. The architecture can support this branch without claiming it is solved by an outdoor campus mesh.

## 10.8 The real-time world contract

| Stream | Proposed contract | What it does not promise |
| --- | --- | --- |
| On-device scan preview | Interactive tracking/coverage feedback while actively capturing | Final dense geometry or campus-wide registration |
| Incremental processing | New provisional chunks appear after successful jobs | A fixed processing time on every device or cloud budget |
| Gameplay | Timely authorized location/effect updates with visible stale state | Continuous opponent tracking or perfect delivery |
| Operational closure | Restricted update with pause/acknowledgement where needed | Silent expansion or rerouting during a chase |
| Environmental refresh | A new observed patch is compared, reviewed, and versioned | Remote live knowledge of unobserved changes |

Moving crowds, traffic, parked objects, lighting, and weather are not live merely because the background model is 3D. Continuous environmental awareness would need additional sensing and governance and is not assumed. ECHO can still feel alive through legitimate live game state, meaningful district changes, and recurrent capture updates.

## 10.9 Concept plates and their interpretation

The PDF illustrates a partially captured world with playable ground, unknown space, an excluded patch, signal overlays, and a creator coverage view. Building positions are invented for explanation. No plate represents an actual scanned BITS Goa asset.

The important visual proof for a future build is a before/after from a real permitted capture: source observations, provisional reconstruction, stylized chunk, and the approved play layer. A rendered campus asset without that lineage cannot demonstrate the scan-to-play claim.

# 11. End-to-end experience and screens

## 11.1 Screen inventory

| Screen | Primary job | Essential content | Main action |
| --- | --- | --- | --- |
| Home | Get a group into a session | Join code, host option, recent approved arena | Join / host |
| Arena preview | Understand where and how play happens | Map, exclusions, mode, estimated session time, access notes | Accept arena |
| Consent and readiness | Make tracking and alerts understandable | Active tracking explanation, role disclosures, permission tests | Run checks |
| Lobby | Assemble the correct group | Roster, roles, readiness, rules summary, host identity | Ready |
| Briefing | Learn the few rules that matter | Capture, freeze, stop-to-interact, pause, boundary | Confirm briefing |
| Head start | Establish a clean opening | Countdown, role-specific instruction, meeting point | No gameplay action |
| Runner HUD | Make the next tactical decision | Own position, next pulse, held items, station status | Use item |
| Hunter HUD | Pursue using permitted evidence | Last-seen areas, evidence age, Sweep, capture request | Scan / capture |
| Item sheet | Make a deliberate choice | Effect, target, cost, counterplay, unavailable reason | Confirm use |
| Station sheet | Collect without confusion | Reward, hold progress, inventory replacement | Hold to collect |
| Freeze state | Stop safely and understand duration | Offer/active distinction, safe-stop instruction, countdown | Acknowledge |
| Capture encounter | Resolve a human encounter | Alias, challenge, confirm/contest, stand-down state | Confirm / contest |
| Connection issue | Reveal system uncertainty | Last accepted update age, actions unavailable, recovery path | Reconnect / pause |
| Pause | Stop a round clearly | Who paused, public reason category, clocks frozen | Host resumes |
| Result | Make outcome and next step clear | Team result, captures, practice flag, feedback, tracking stopped | Rematch |
| Survey Mode | Capture a permitted patch | Camera preview, pose quality, observed surfaces, inspected route, anchor status | Record / revisit gap |
| Reconstruction review | Inspect a candidate world | Source views, transform residuals, geometry, privacy and missing observations | Request correction |
| Play-mask / graph review | Decide valid territory independently of scenery | Coverage, access, exclusions, connectivity, objective dependencies | Approve candidate |
| World publication | Release coherent artifacts | Manifest hashes, QA, reviewer, compatible versions | Publish world |
| World loading | Enter the exact match world | Required authority assets, visual tier, closure revision | Confirm ready |
| Stopped localization | Resolve a precise interaction if required | Camera consent, anchor state, pose quality, fallback | Localize / cancel |

## 11.2 Runner HUD

The top bar shows role, remaining chase time, and connection state. Beneath it, one large line says "Next pulse in 00:24." The map occupies most of the screen. A compact bottom tray contains up to two item cards with large controls. An always-visible pause/leave affordance sits apart from inventory actions.

A runner does not need a dense feed of every event. Show only relevant notices: disclosure occurred, Freeze pending/active outcome, a station claim result, a connection issue, and a match-state change. Team capture counts can remain in a small status pill.

**Example copy:** "You will reveal in 24s." "Freeze sent - waiting for Mira to stop." "Freeze active: 8s. Your approximate area was revealed." "Signal weak. Stop somewhere safe to reconnect."

## 11.3 Hunter HUD

The top bar is similar but emphasizes remaining runners. The map shows only current disclosures and their ages. Selecting a marker reveals the source: scheduled pulse, Sweep, or Freeze caster disclosure. This matters because the hunter needs to know whether a signal is current evidence or older context.

The bottom actions are Sweep and Request capture. Request capture opens the roster, not a nearest-dot auto-selection. The capture sheet repeats the no-touch and line-of-sight rule. A dedicated legend explains coarse areas and uncertainty.

**Example copy:** "R3 - last seen 32s ago." "Sweep: 1 confirmed signal, 1 uncertain edge signal." "No confirmed signals in range. 1 signal unavailable." "GPS proximity is not a catch."

## 11.4 Freeze screen

The incoming offer uses a large title and a clear instruction: "Stop safely, then acknowledge." The acknowledgement button is large and distinct from "Pause for safety." After acknowledgement, the screen changes to a high-contrast countdown with the authoritative remaining duration. End-of-freeze feedback uses haptic, visual, and optional audio cues.

If the client receives an expired offer, it does not ask the hunter to stop retroactively. It fetches the current state, shows "offer expired," and lets the host address any connection problem. A delayed push must never resurrect an effect.

## 11.5 Host and steward controls

Hosts see readiness and operational state, not a cheat map. The control page offers start, pause, resume, cancel, remove a participant between rounds, and record a ruling. Show a plain confirmation before ending a live match, but make safety pause immediate.

A separate steward can access a restricted incident view if necessary. Prefer event IDs, role states, acknowledgement times, and signal age over a full route trace. If a genuinely necessary location disclosure occurs for an incident, require an explicit reason, restricted access, and an audit record. The pilot should avoid creating a routine surveillance console.

## 11.6 Interaction details that make the app feel finished

A reconnect should preserve the screen context without replaying obsolete animations. Button states should explain why an action is disabled. A held station interaction should cancel if the player leaves the patch, loses acceptable location quality, or receives a pause. A successful activation should show one definitive outcome rather than separate optimistic and contradictory success messages.

Use event stacking: an incoming freeze or capture encounter takes precedence over a decorative pickup animation. Safety and connectivity messages remain visible. No tutorial tooltip may cover pause or leave.


## 11.7 Survey Mode: a creator surface, not a chase overlay

Show the live camera above a small coverage map and a status strip for tracking, evidence recording and route inspection. The creator can see a wireframe/point preview where supported, but the UI clearly labels it provisional. A captured-surface overlay and a walked-route ribbon use different colors. A facade can become visually observed without its surrounding ground becoming playable.

A gap task includes a reason and an action: add a side view, reconnect to a known feature, rescan after tracking loss, inspect a junction, or seek review of a restricted boundary. Save/retry states make interruptions recoverable. Scanning is a deliberate camera-on activity outside a competitive chase.

## 11.8 World Lab and publication

The desktop review workspace has independent toggles for source evidence, reconstruction, uncertainty, appearance, traversable coverage, access approval, route graph, exclusions and landmark identity. Selecting a route exposes the evidence and review that support it. A validation panel explains publication blockers rather than merely displaying a green model.

A before/after viewer compares registered versions. Geometry, appearance and operational changes are separate categories. Publishing shows the exact artifact manifest, world version and affected dependent objectives. A visual preview cannot bypass a failed topology or approval check.

## 11.9 World loading and uncertainty

Preflight downloads the authoritative play layer and a usable visual fallback before readying a player. A detailed facade can stream later; the legal boundary cannot. If the device loses map-relative precision, the HUD returns to coarse positioning with an explanation. It does not keep drawing a precise-looking icon as if localization were unchanged.

## 11.10 Creator and player privilege separation

An editor may inspect private capture evidence for their world but receives no privileged live opponent feed. A playing host receives only their role's disclosures. A captured player cannot open the world debug view to infer where active players are. These access boundaries apply to payloads, not only menu visibility.

# 12. Visual identity and example styling

## 12.1 Direction: a campus field console

The intended feel is playful, precise, and place-based: a captured campus gradually resolving from unknown space into a recognizable game world. Think of a well-designed field instrument with a miniature campus inside it. Avoid a military surveillance aesthetic, fake weapons, or photorealistic pursuit imagery. Rounded architecture, restrained signal rings, and friendly aliases fit a student group better.

Use a small wordmark, an abstract echo-ring symbol, and understated local arena branding. The campus pack can have its own accent or nickname. Do not use official BITS or OpenAI logos or imply endorsement without permission.

## 12.2 Design tokens

| Token | Proposed value | Use |
| --- | --- | --- |
| Ink | `#10263A` | Main text and deep background |
| Paper | `#F4F7F2` | Outdoor screen background |
| Surface | `#FFFFFF` | Cards and controls |
| Runner | `#087E8B` | Runner accent, with contrast-checked text |
| Hunter | `#B85012` | Hunter accent, with icon and label |
| Signal cyan | `#67DCE5` | Map highlight; avoid small text on white |
| Signal amber | `#FFC857` | Scan ring and item highlights |
| Warning | `#9B3429` | Boundary and connection warnings |
| Muted | `#576975` | Secondary text |
| Unknown world | `#182736` | Shared unmapped/outside-play fog and boundary hatch |
| Captured preview | `#67DCE5` | Provisional wireframe in creator mode, never implied approval |
| Approved coverage | `#DDE9DF` | Solid permitted ground treatment |
| Border | `#CAD5D9` | Separators and input boundaries |
| Spacing | 4, 8, 12, 16, 24, 32 px | Consistent layout rhythm |
| Corners | 12 px controls, 18 px cards | Friendly but functional |
| Type | System sans first; optional Inter / Manrope after licence review | Legibility, small payload |
| Minimum target | 48 x 48 logical px, larger for primary actions | Stopped one-handed interaction |

Role colors are not sufficient on their own: runner uses a circle/footprint motif and a RUNNER label; hunter uses a diamond/radar motif and a HUNTER label. All critical text pairs require contrast measurement in the actual UI. Hex choices are a starting palette, not an accessibility certification.

## 12.3 Layout examples

**Home:** a light canvas, large ECHO wordmark, compact campus selector, and two clear actions: Join a hunt and Host a hunt. A tilted miniature map provides the hero graphic. Below it, a three-line explanation covers private groups, approximate signals, and outdoor boundaries.

**Lobby:** a map thumbnail on top, readable arena/version label, role-colored roster cards, readiness indicators, and a fixed bottom Ready button. The host's Start button is enabled only when required checks pass. Prefer friendly readiness copy over a wall of red diagnostics.

**Live map:** mostly map; one timer; one next-event line; a bottom tray with at most two powers. The screen does not need a floating joystick, health bar, speed stat, quest list, chat drawer, and mini-map simultaneously.

**Results:** a bold team outcome, a short explanation, three useful stats, a "tracking stopped" confirmation, and Rematch. A future share card can use aliases and a decorative schematic, never an automatically exported precise route.

The PDF includes a three-phone concept plate for the runner, hunter, and Freeze state. These are layout examples, not implemented screenshots. The Markdown descriptions and tokens are sufficient to recreate them without embedded image assets.

## 12.4 Motion, sound, and haptics

Use brief, restrained transitions: a 150-250 ms item-state change, a single pulse ripple, and a short Freeze start/end cue. Do not continuously animate dozens of expanding rings. Honor reduced-motion preferences and let players disable decorative motion.

Establish distinct cues for scheduled pulse warning, targeted Freeze, capture confirmation, and match pause. Audio is optional and should never require headphones while moving. Haptics and notifications are aids, not guarantees that the person perceived the event. The readiness test verifies the selected configuration before play.

## 12.5 Accessibility and outdoor readability

Support dynamic text, clear labels, high contrast, large controls, reduced motion, and a flat-map option. Avoid time-critical gestures that require precision. Provide a walking preset and route accessibility metadata where verified. Do not use stairs or steep shortcuts as the only path to an objective.

Test with screen glare, one-handed use while stopped, sweaty hands, older devices, low battery, and noisy surroundings. A beautiful desktop mockup is not enough evidence for an outdoor product.


## 12.6 Visual signature: the campus materializes

The product's defining transition is captured evidence resolving into a world chunk. In Survey Mode, observed surfaces appear as a restrained wireframe; in World Lab, a registered model is compared with its source views; after publication, approved ground becomes solid and playable while unknown regions retain their graphite hatch. Use a short reveal animation only after the actual state changes.

A creator progress card should show separate values for captured evidence, reconstruction, route review and publication rather than a fake all-purpose scan percentage. A world-loading card can show its version and completion of required assets, while ordinary players see readable status rather than internal hashes. The PDF's extra creator plate illustrates this distinction without implying a real campus scan has already occurred.

# 13. Safety and campus operations as gameplay design

The game works only when the play area and rules produce acceptable behavior. Treat this as level design and event operations, not a disclaimer pasted onto the start screen.

**Start conditions:** private consenting roster; verified outdoor arena; permission for the planned use; daylight for early tests; a steward or responsible host; clear stop-to-interact instructions; no vehicles; no entry into residences or restricted buildings; and a known meeting point.

**Before each round:** inspect closures, crowding, slippery surfaces, heat, rain, visibility, and connectivity. Cancel or switch to a walking test if conditions are unsuitable. Do not use a reward that encourages someone to cross a road, jump a barrier, climb, or enter a private space.

**During play:** any participant can initiate an immediate safety pause. The app sends it to everyone, halts game actions, and announces that players should stop safely. Notification delivery cannot guarantee instant physical compliance; the briefing must establish verbal stop calls and how to communicate if phones fail. A pause does not depend on a vote.

**At the boundary:** give a clear warning and directions to the approved area, without publishing new enemy positions. A steward resolves repeated or intentional violations. Do not infer intent from one GPS point.

**Real incident:** the app is not an emergency response service. It should show the event's verified contact instructions and the phone's normal calling affordance. Do not invent or automatically populate campus emergency numbers. A real emergency overrides the game and may require ending the round.

**Privacy in physical space:** only rostered players are targets. No photographing bystanders to identify someone, chasing nonparticipants, or using the app to follow a person outside the round. Display aliases and a role indicator so players can identify the consenting group.

**Permission scope:** approval to run a student test is not automatically approval to place permanent QR signs, commercialize campus imagery, film an event, or host a large festival game. Resolve these separately before that feature or event exists.

# 14. When the real world breaks the ideal rules

## 14.1 Reliability is part of balance

The application must distinguish location sampling, connectivity, action delivery, and human acknowledgement. A live socket does not prove a fresh GPS measurement. A background location task does not prove an alert was heard. A push provider accepting a message does not prove it reached the device [S14].

Web geolocation specifies visibility constraints; a hidden browser document is not a reliable basis for active pocketed-phone tracking [S01]. Native background tracking still requires the correct platform configuration, permissions, and device testing [S02, S03, S07]. Neither implementation can guarantee continuous operation after force-stop, permission removal, battery failure, or network loss.

## 14.2 Pilot degradation policy

| Condition | Immediate response | If unresolved |
| --- | --- | --- |
| Location age exceeds 10 s | Mark signal unavailable; disable location-dependent powers and station claims | At 20 s, request global technical pause |
| No accepted health contact for 10 s | Client shows offline; server stops accepting abilities from it | At 20 s, global technical pause |
| Accuracy worse than 25 m | Show uncertainty; reject precision-dependent interactions | Try a safe open area; pause if still unusable after 20 s |
| Freeze offer unacknowledged after 5 s | Release item; no disclosure; record failed offer | Steward checks alert path; repeated failures pause the match |
| Permission revoked | Stop local tracking; mark participant unavailable | Pause, explain, and allow immediate exit |
| App killed or phone battery fails | Treat as unavailability, never stealth | Pause and reconnect or mark round incomplete |
| Whole service loses contact | Clients independently enter stop-play state on timeout | Rejoin and synchronize; no offline scoring |
| Device clock changes | Keep server-based durations and measured offset | Resync time; reject absurd timestamps |
| Apparent teleport | Quarantine suspect sample; request new readings | Steward review; never instant ban |
| GPS says outside but player disputes | Caution and safe check | Repeated evidence plus human review |

The 10/20-second limits are proposed pilot values. Tune them only after a real-device connectivity walk. An isolated missed update must not create endless pauses; neither should repeated pauses be ignored merely to keep the chase moving.

## 14.3 What a technical pause means physically

Players stop chasing and move only as needed to reach a safe stopping place. No powers or pickups resolve. Capture attempts not already confirmed are cancelled into a steward-reviewed encounter; they are not silently completed. Freeze offers expire without consuming an item. An active Freeze keeps its remaining duration and resumes after the countdown. Expired push notifications are discarded.

The host has up to 60 wall-clock seconds to recover a simple fault before deciding to continue as a visibly incomplete practice round or end. A countdown before resume gives every phone a chance to acknowledge the same state. If a participant cannot resume, apply the withdrawal policy. Never treat disappearance as proof they were caught.

## 14.4 Boundaries, lag, and disputes

A server-confirmed action is authoritative for game state. A human encounter still needs both people's agreement under the capture convention. The steward records an explicit ruling when the two conflict. Do not disguise manual rulings as automatic GPS decisions.

Show an action receipt with event ID, accepted time, and outcome. Repeated taps should return the same receipt. A UI that says "Freeze used" followed by "actually it failed" teaches players not to trust it; prefer a visible pending state.

For a first pilot, pause rather than inventing complex compensation such as rewinding a person through a route they have already run. ECHO is a real-world game, so physics and human attention cannot be rolled back like a simulated match.


## 14.5 Spatial-world failure modes

A missing or mismatched authority chunk blocks readiness. A missing optional texture falls back to an approved proxy. A tracking-origin reset creates a new capture segment. A failed reconstruction remains a draft. An ambiguous visual match remains coarse or unlocalized. None of these errors may silently expand play territory.

A closure touching a required objective invalidates that mode/world combination until a declared fallback or new publication resolves it. A live safety restriction pauses or ends the affected round; it does not make players discover the change by running into a blocked route. A GPU queue outage delays new world creation while already published worlds remain usable.

# 15. Consent, privacy, and abuse resistance

## 15.1 Collection contract

Collect location only for a session the player explicitly joins, beginning at the declared readiness/start phase and ending on capture, withdrawal, round end, or permission revocation. A brief readiness fix is for the check and is not an invitation to track all day. Show when tracking is active, including platform indicators where provided.

The consent explanation should answer: who receives approximate snapshots, how often, which abilities reveal extra information, what operational access exists, when collection stops, and how deletion works. Freeze's caster reveal belongs in that explanation because it is part of an item cost.

Support an immediate Leave and stop sharing action. It should stop the app's sampling task, clear local queued coordinates, revoke session participation, and request server cleanup. If offline, stop local collection immediately and send withdrawal on reconnect. Other players learn that the session lost a participant through health timeout; they are not given continued access to coordinates.

## 15.2 Proposed retention schedule

| Data | Pilot retention proposal | Reason |
| --- | --- | --- |
| Latest accepted raw location | Overwrite during play; purge within 1 hour of session end or withdrawal | Resolve current rules and brief operational faults |
| Bounded raw sample buffer | At most 30 s of samples; server memory or tightly restricted short-TTL store | Quality checks, not route recording |
| Recipient-specific coarse disclosures | Persist only as needed for reconnect; delete within 24 hours | Resume permitted views and resolve immediate disputes |
| Non-coordinate gameplay events | 30 days | Debug rules, review playtest outcomes |
| Aggregated anonymous match stats | Longer if genuinely de-identified and disclosed | Product learning without route history |
| Account identifier | Until account deletion or disclosed inactivity policy | Private roster continuity |
| Explicit incident record | Separate access-controlled policy and review | Retain only what is necessary for that incident |

These are product proposals, not a statement of legal compliance. Actual deletion must cover caches, logs, support tools, exports, and backup expiry. Do not claim instant erasure from immutable backups if the system cannot deliver it. Public launch, especially involving minors or new jurisdictions, needs current legal review of consent, retention, and location handling.

## 15.3 Access and trust boundaries

A short join code is an invitation convenience, not a security boundary. Rate-limit attempts, expire codes, require host approval for a closed game, and issue a real session credential after authentication. Restrict one active device per participant for the pilot; changing devices requires an explicit reconnect process that revokes the old session.

Role changes must immediately change subscriptions and available views. A captured runner must lose future disclosures, not merely lose the button that opens them. A removed spectator must lose access even if their socket remains connected. Backend permissions need tests for these transitions.

Keep operational credentials and third-party keys on the server. Exclude location from crash reports, analytics payloads, breadcrumbs, support screenshots, URL query strings, and notification text visible on lock screens. Treat an alert as an invitation to open the app, not a place to display coordinates.

## 15.4 Cheating: a realistic model

Players can lie about a capture, ignore a freeze, share screenshots, use a second phone, collude verbally, mock device location, or take an impermissible shortcut. No student app can prove perfect physical compliance. The first defense is a small trusted group, understandable rules, and a steward.

Use server authority to prevent digital cheating: unlimited scans, edited inventory, forged role claims, replayed commands, unauthorized map subscriptions, and fake client-side timers. Use location quality and movement heuristics only as signals for review. More invasive device attestation can be evaluated later but is not proof that a person obeyed the real-world rules.

Do not collect continuous video or audio to police players. It would create a different product with major privacy costs and still not solve every dispute.


## 15.5 Scan evidence and spatial privacy

Survey imagery is a separate data product from active-player coordinates. Capture only permitted places, avoid bystanders and private interiors, and review source images plus derived textures/splats/reference features before any intended distribution. A proposed pilot policy keeps private raw survey evidence for up to 30 days unless a separately agreed reprocessing need justifies longer; approved world derivatives have an explicit maintained-world lifecycle. Those proposals must match the actual permission and deletion process.

Redaction must propagate to derivatives. Removing a face from a preview does not remove it from a texture atlas, splat or localization database. Maintain dependency lineage so affected assets can be rebuilt or retired. Creator consent does not replace the rights or privacy expectations of people who happened to appear in a scan. Hosted localization may send query imagery to another provider and requires its own clear disclosure and access decision.

Map geometry and visual features can themselves be sensitive. Keep private evidence and localization indexes access-controlled; do not publish detailed restricted interiors as an accidental CDN asset. A world contribution is not automatically a public upload.

# 16. Social design, motivation, and replayability

The most natural growth loop is a participant saying, "Let's swap roles and play again." Optimize rematch time: preserve the consenting roster, rotate hunters, show what changed in the preset, and run a quick alert/permission health check. Never carry location tracking into a social lobby after the round has ended.

Use lightweight achievements tied to decisions: useful scans, confirmed rescues in rescue mode, collecting a risky station, or completing a walking quest. Avoid humiliating labels for early captures and avoid public route histories. A player's least athletic round should not become a permanent social ranking.

A shareable result card can include arena artwork, team outcome, aliases chosen for sharing, total captures, and a short player-approved highlight. Generate it only on request. It should omit precise locations, sensitive timestamps, and bystanders. Do not post or send automatically.

For retention, rotate approved station presets, run limited themed rule sets, and improve the map as students recognize new details. Earn replayability through different decisions on the same arena. Daily streaks, manipulative notifications, and paid random-power packs would add little to a scheduled physical game.


## 16.1 The second social loop: build your world

Mapping teams can adopt a permitted district, improve landmark quality, repair a missing connection or validate a rescan. Contributor credit belongs to useful reviewed work and can appear in a world's history. Keep competitive powers independent from creator status. A creator badge can celebrate a surveyed loop; it must not grant extra scans in a match.

A shareable world reveal can show reviewed source-to-model comparisons, contribution credits and a stylized district, with no identifiable bystanders or private active-player traces. The community's relationship to its actual campus is part of the product, not merely a distribution channel.

# 17. Beyond BITS Goa: a creator platform for playable places

## 17.1 The reusable object is a compiled world

The scalable unit is no longer merely a map pack. It is a versioned world containing evidence provenance, coordinate transforms, appearance chunks, verified coverage, topology, landmarks, localization references, and compatible game rules. A campus pack is one distribution of that world for a particular session.

Another college should use the same capture client, processing pipeline, review tools, and game engine. It contributes different evidence and permissions rather than forking the code. The long-term product is both a multiplayer game and the infrastructure that turns a permitted real place into a maintained arena.

## 17.2 Creator and player communities reinforce each other

A good world produces better games; repeated games reveal missing landmarks, ambiguous junctions, weak-signal patches, and useful objectives; those observations guide the next survey. This is the intended feedback loop. The app should expose actionable maintenance tasks without publishing private player trajectories.

Give contributors a visible world-building history, district credits, and shareable before/after artifacts with reviewed imagery. Credit useful corrections as well as glamorous scans. Keep contribution incentives separate from competitive inventory, so creators cannot earn unfair powers by uploading footage or paying for hardware.

## 17.3 Publishing and governance

World maintainers manage draft branches. Reviewers verify geometry, access, source permissions, and quality. A release compiler creates an immutable manifest. Match owners pin that manifest. A restriction overlay can close a region quickly; an expansion or new route needs a fresh approved publication.

Support district ownership, conflict resolution, evidence access controls, contribution revocation where applicable, asset reprocessing, and rollback. A public unreviewed scan is not automatically an endorsed game arena. An external provider's asset access policy must not become an accidental public release of campus scans.

## 17.4 Other environments

| Setting | Strong product variant | Additional work |
| --- | --- | --- |
| Another campus | Scan-to-play districts and student-organized hunts | Local permissions, geometry, maintainers, signal survey |
| Park / community venue | Verified walking hunt or objective game | Public-space etiquette, seasonal closures, accessible routes |
| Festival | Relay and checkpoint mode without sprint pursuit | Crowd-aware operating rules, timed sessions, steward capacity |
| Orientation | Scan-backed campus quest and landmark discovery | Reviewed content and a non-adversarial pacing model |
| Indoor venue | Floor-aware AR/objective mode | Explicit floor localization, connectors, scanning permission, egress review |
| City | A later research/commercial branch | Traffic, fragmented access, much greater operational complexity |

The software can accept larger datasets before the operations can responsibly support a larger game. Keep world extent, active arena extent, device capacity, and event capacity as separate limits.

## 17.5 What would make the platform defensible

The value compounds through high-quality maintained local worlds, robust ingestion from heterogeneous phones, automatic but reviewable compilation, stable landmark identity, useful topology-aware modes, and an organizer workflow others can operate. Do not confuse a dependency on someone else's scan viewer with ownership of that pipeline.

The capture adapter should accept third-party scan exports, but ECHO's canonical world schema and game rules remain independent. Preserve evidence and transforms needed to recompile if a vendor changes pricing, format support, or access rules.

# 18. Business and distribution options

The first distribution channel is the existing friend group and student-community setting described by the founder. Treat the Studio Hours opportunity as a place to demonstrate progress and obtain feedback, not as a substitute for player validation or evidence of endorsement.

| Model | What is paid for | Advantages | Risks / timing |
| --- | --- | --- | --- |
| Free private campus pilot | Nothing | Fast feedback and low joining friction | Founder absorbs hosting and support |
| Organizer subscription | Event tools, templates, approved packs, reporting | Aligns revenue with the person creating value | Requires dependable operations and recurring event demand |
| Per-event licence | One event, defined participant capacity | Easy to understand for occasional organizers | Support peaks and cancellation expectations |
| Custom arena service | Mapping, art, setup, and training | Clear early service revenue | Labor-intensive; avoid pretending mapping is automatic |
| Cosmetic customization | Themes, badges, result-card styles | Does not alter competitive fairness | Small audience may not justify complexity |
| Institutional orientation package | Quest content and campus pack | Reuses mapping without chase constraints | Different buying process and product expectations |
| Consumer power purchases | Gameplay advantage | Not recommended | Damages fairness and trust |
| Location-data monetization | Selling or exposing movement data | Reject | Conflicts with the product's consent model |

Begin with a free closed pilot and a simple organizer interview: who currently arranges campus games, how often, how much setup hurts, and whether they would pay for reliable event tools. No market-size or revenue forecast is justified yet.

Distribution experiments can include a campus club demo, friend referrals, an organizer-run session, and a short consented gameplay video. Avoid uploading identifiable participant footage or sharing a roster merely to promote the app.


## 18.1 The spatial-platform business branch

If scan-to-play proves valuable, organizers may pay for maintained private worlds, capture/review tooling, world storage/processing allowances, event operations and custom modes. Institutions may want orientation or discovery uses of the same verified spatial assets. Price reconstruction jobs and maintenance transparently rather than burying unbounded GPU work inside a nominal per-player fee.

These are hypotheses. Validate creator throughput, ownership expectations, maintenance effort and willingness to pay before a marketplace or institutional sales plan. Selling player routes or making paid users better hunters conflicts with the information contract.

# 19. Delivery plan: simple demo, ambitious product

## 19.1 Stage A: real GPS multiplayer demo

Use a normal GPS map, private lobby, hunter/runner roles, a real server clock, timed disclosures, basic Freeze/Sweep, and mutual catch confirmation. A manually surveyed permit mask bounds the test. Actual consenting participants can move on a small walking route; simulated fixtures remain clearly labelled and separate.

A browser demo is appropriate while its screen is visible. A locked-screen chase requires a native location/alert implementation and device testing. This is a platform constraint, not a statement about the founder's ability. The demo should already use world IDs, rule versions, recipient filtering, and a replaceable map provider so it is compatible with the later world system.

## 19.2 Stage B: one real scan-to-play slice

Capture one authorized patch, ingest the evidence, reconstruct or import a registered model, derive a stylized chunk, review a coverage mask and route loop, publish a manifest, and play a round on that exact release. Show an unmapped hole that remains excluded. This is the first proof of ECHO's distinctive thesis.

An off-the-shelf scanner/export can accelerate the initial evidence prototype, provided its rights and export metadata are suitable. That does not have to remain the final capture system. In parallel, build the native capture adapter that records the metadata required by the owned pipeline.

## 19.3 Stage C: the spatial multiplayer alpha

Connect multiple overlapping chunks; validate alignment and stable landmarks; stream visual LODs; support explicit stopped relocalization; implement Graph Sweep and Path Decoy; and run Signal Districts on a maintained world. Capture, approval, and game-state systems are now first-class product surfaces.

## 19.4 Stage D: a maintained multi-creator campus world

Add contributor sessions, reconstruction branches, change proposals, privacy review, chunk rebuilds, closure overlays, independent maintainers, and repeatable publication. Better visuals, optional splat browsing, and additional modes grow alongside measured capture quality and creator throughput.

## 19.5 Stage E: reusable world platform

Support multiple venues, creator roles, localization providers, operating presets, and organized events through the same canonical schema. This is a substantial platform stage, not a promise that a finished campus can be exported into a safe public-city game with one toggle.

| Capability | GPS demo | Scan-to-play slice | Spatial alpha | Maintained platform |
| --- | --- | --- | --- | --- |
| World | Temporary permit mask | One captured verified patch | Connected districts | Multi-creator, multi-venue |
| Appearance | Basemap / simple proxies | Real scan-derived asset | Streamed stylized world | Hybrid high-detail browsing |
| Authority | Versioned 2D rules | Coverage-backed play mask | Graph and landmark rules | Reviewed world releases |
| Capture | Separate experimental session | Import + native recording prototype | Guided creator mode | Collaborative capture and refresh |
| Powers | Freeze / Sweep | Same on captured world | Graph Sweep / Path Decoy | Rich spatial presets |
| Localization | GNSS with honest uncertainty | Known anchor/control checks | Optional visual relocalization | Provider adapters and maintained references |
| Updates | Static session setup | Rebuild patch between rounds | Versioned chunk refresh | Change workflow and restriction overlay |

Sequencing reduces uncertainty; it does not narrow the final vision. Budget and roadmap should expose the work in each stage instead of assuming a generic MVP is the whole product.

# 20. Validation: learn whether it is fun and whether it works

## 20.1 Questions that matter

**Desirability:** do participants want a second round; can they describe a tactical choice; does the organizer want to run it again without the founder doing everything?

**Fairness:** do both roles feel they have agency; do freezes feel short and understandable; are scans useful without becoming continuous tracking; can someone survive through decisions rather than only athletic ability?

**Reliability:** do supported devices keep delivering acceptable updates in pockets; do alerts reach people in time; do pauses recover cleanly; can players understand uncertainty without developer explanation?

**Operations:** can the arena be inspected quickly; do stations cause crowding; does anyone feel pressured into an excluded area; does an event need more stewards than expected?

## 20.2 Testing ladder

1. **Tabletop simulation:** use a schematic map and scripted events. Walk through collisions, pauses, and ability interactions without anyone running.
2. **Two-device bench test:** validate role filtering, clocks, challenge expiry, duplicate commands, and reconnect.
3. **Two-person walking test:** test background location and alerts with the screen locked; test known poor-signal patches.
4. **Four-person supervised test:** validate capture conventions and Freeze acknowledgement before adding complex station movement.
5. **Six-to-ten-player closed round:** use one arena and fixed preset. Have a separate observer record usability issues.
6. **Repeat with roles swapped:** compare information quality and enjoyment, not only the final result.
7. **Independent-host test:** another organizer runs the session using the briefing and controls without developer coaching.

Do not jump from a desk demo directly to a large campus event.

## 20.3 Proposed pilot gates

| Measure | Initial target | Interpretation |
| --- | --- | --- |
| Critical rule comprehension | At least 90% can explain capture, pulse, freeze, pause after briefing | Small samples need counts as well as percentages |
| Lobby-to-ready time | Under 5 minutes after installation | Report permission and installation time separately |
| Accepted location freshness | At least 95% of eligible participant-seconds at or below 10 s | Evaluate on the tested devices and arena only |
| Connected command receipt | p95 under 1 s to accepted/rejected receipt | Excludes human acknowledgement; measure rather than assume |
| Freeze offers | At least 90% safely acknowledged within the 5 s offer in pilot trials | If missed often, change the mechanic before scaling |
| Crash-free rounds | All initial supervised rounds | Any data loss or privacy leak blocks release |
| Technical pauses | At most one recoverable pause per short round as an initial goal | Repeated pauses indicate unsuitable configuration |
| Replay interest | At least 6 of 8 participants choose another round | Behavioral signal, not product-market fit |
| Critical safety / location exposure defects | Zero tolerated | Stop and fix before another field round |
| Tracking shutdown | Every tested exit path stops local sampling and revokes game access | Verify logs and network behavior without retaining raw routes |

These thresholds are founder-selected release gates. They are not documented platform capabilities or statistically established campus benchmarks.

## 20.4 Feedback and instrumentation

Ask three questions immediately: "What was your best decision?" "What felt unfair or confusing?" "Would you play again now?" Ask the host what they had to explain twice. Save structured event counts and timings without coordinates or unnecessary identities.

Track failures by stage: permission, background sample, uplink, server validation, event delivery, UI presentation, and human acknowledgement. Otherwise a missed freeze gets labelled a generic "network issue" and cannot be fixed.


## 20.5 Spatial evaluation programme

Evaluate capture quality, relative geometry, geographic alignment, legal connectivity, appearance recognition, localization and game usefulness separately. Use held-out references rather than measuring only the controls used to fit a transform. If absolute ground truth is weak, disclose that and report the appropriate weaker result.

| Question | Experiment | Release implication |
| --- | --- | --- |
| Can ordinary phones contribute? | Capture the same patch with RGB/VIO and optional depth profiles | Define supported capture profiles independently of player devices |
| Do sessions align? | Two overlapping captures plus distributed held-out references | Reject drifted or ambiguous chunks before publication |
| Does unknown remain unknown? | Insert a visible-but-unwalked lawn and an unobserved graph gap | Neither becomes playable through mesh filling or polygon union |
| Is the world recognizable? | Ask locals to identify landmarks and route choices from the compiled model | Improve meaningful silhouettes and labels rather than pure texture resolution |
| Does localization fail honestly? | Wrong-place, changed-light, repeated-facade and no-network queries | Return uncertain/coarse; no false precise action eligibility |
| Does a spatial power add value? | Compare Graph Sweep/Path Decoy with the GPS-only preset | Continue mechanics that create distinct decisions |
| Can the world change safely? | Close an edge, rescan, rebuild derivatives and republish | Preserve stable identities and pinned matches; restrict live play visibly |
| Can another creator operate it? | Independent capture, review and publish of a small patch | Measure time, rejected evidence, repair effort and successful publication |

Track accepted keyframes, tracking-loss segments, registration residuals, unsupported/unobserved area, reviewer corrections, job cost, asset size, load time, mobile thermal behavior and verified useful coverage per creator-hour. Do not replace this with one opaque scan-quality score.

# 21. Engineering roadmap: build the hard parts deliberately

This is a spatial-computing and multiplayer project. A realistic plan separates product engineering, field data acquisition, reconstruction research, and operational publishing. The founder's coding ability is assumed; the unknowns are sensor quality, alignment, world usefulness, device behavior, and iteration time.

## 21.1 Workstreams and dependencies

| Workstream | Concrete output | Depends on | Evidence required |
| --- | --- | --- | --- |
| Multiplayer core | Private sessions, clocks, role views, receipts, captures, recovery | Protocol and baseline rules | Two real devices survive failures without hidden-state leaks |
| Capture | Sensor recorder, quality HUD, resumable evidence bundle | Device capability and camera access | Repeatable datasets with valid calibration and timestamps |
| Reconstruction | Registered geometry and quality report | Captures and compute | Held-out landmarks align; failed sessions are rejected |
| World compiler | Appearance chunks plus independent play artifacts | Geometry, coverage, review inputs | Unknown holes and exclusions remain forbidden |
| Native world client | Streamed map, creator mode, stopped AR interactions | Manifest contract and native plugins | Supported device performance and uncertainty behavior |
| Spatial game design | Graph Sweep, Path Decoy, Signal Districts | Verified route graph and landmark IDs | Players make decisions that a flat GPS map did not support |
| Maintenance | Revisions, closure overlays, contributor review | Stable IDs and evidence lineage | Changed region can be closed, rebuilt, and republished cleanly |

Work can overlap without requiring a large organization. Keep interfaces stable enough that a reconstruction experiment does not block the GPS referee, and a new game mode does not require recapturing the campus.

## 21.2 Milestone envelope

The following are planning estimates for one technically capable student working part-time with access to willing testers. They are not guarantees; compute access, scan quality, review requirements, academic workload, and support from collaborators can dominate elapsed time.

| Milestone | Indicative envelope | Demonstrable outcome |
| --- | --- | --- |
| M0: product and sensor spikes | 1-2 weeks | Reference-app study, permitted patch, capture dataset, protocol/world schema |
| M1: GPS multiplayer demo | Another 2-4 weeks | A real walking round with pings, basic powers, catches, and pause/reconnect |
| M2: one scan-to-play patch | Another 3-6 weeks, partly overlapping M1 | Capture to published recognizable chunk; unmapped hole excluded; same match runs on it |
| M3: spatial alpha | Another 8-16 weeks | Connected chunks, native streamed world, relocalization experiment, graph powers |
| M4: maintained campus product | Additional 3-6+ months | Multi-creator review, refresh, privacy processing, independent hosting and maintenance |
| M5: multi-venue platform | Planned from measured M4 evidence | Repeatable onboarding of another maintained world |

A roughly 2-3 month first closed scan-to-play demonstration and a 6-12+ month serious campus product are reasonable working envelopes for this scope, subject to the stated assumptions. Dense reconstruction or localization R&D can extend them. More developers can parallelize defined modules; they do not remove the need for field evidence.

## 21.3 Technical risk spikes to run early

**Capture spike:** record the same permitted scene on an ordinary RGB/AR-capable phone and a depth-capable device if available. Compare reconstruction quality, operational effort, and metadata completeness. Do not buy hardware until the actual gap is measured.

**Registration spike:** capture two overlapping sessions independently and align them to common control references. Test a third held-out landmark. The visual model looking straight is not evidence of correct geography.

**Compiler spike:** deliberately include an unknown gap and an apparent mesh bridge created by processing. Verify neither becomes a legal path. Close one edge and verify dependent objectives become invalid.

**Client spike:** load several LOD chunks while location and alerts run, then test thermal behavior, memory, and outdoor readability. Rendering a downloaded model in isolation is insufficient.

**Localization spike:** compare GNSS-only placement, a known marker/anchor, and optional image-based relocalization. Test changed light, repetitive architecture, and wrong-place visual matches.

**Gameplay spike:** run the same group once on Classic Signals and once with Graph Sweep/Path Decoy on the captured graph. Ask whether the spatial layer changed decisions enough to justify its cost.

## 21.4 First twelve implementation sessions

1. Play and document a close reference app on its actual current build.
2. Define the world manifest and capture bundle before choosing every rendering dependency.
3. Record one permitted loop with keyframes, calibration, motion and GNSS priors.
4. Reconstruct or import the patch; document what is missing and what the coordinate frame means.
5. Align it with control points and evaluate held-out references.
6. Produce both a stylized appearance chunk and an independent reviewed play mask.
7. Build the GPS multiplayer loop against the same world/role contracts.
8. Implement the native sensor/background-location adapters and test actual devices.
9. Publish the captured chunk and load it in the player renderer.
10. Run pulse, Sweep, Freeze, catch, pause and reconnect on that release.
11. Add one graph-dependent mechanic and demonstrate its difference from a radius query.
12. Rescan a changed patch and prove versioned replacement without corrupting an existing match.

The objective of the early schedule is a complete thin slice of the ambitious architecture, not a commitment to keep the final product technically simple.

# 22. The Studio Hours showcase: prove the transformation

## 22.1 The story the demo should tell

Lead with the real vision: "We build the game world by walking and scanning the place." Show the familiar GPS chase briefly, then show the world-building loop. The audience should understand why this goes beyond an existing manhunt app.

| Segment | Time | Demonstration |
| --- | --- | --- |
| The reference and gap | 20 s | Existing apps establish timed GPS chase; ECHO adds capture-to-play world creation |
| Capture | 30 s | A short consented recording of an actual permitted campus patch, with tracking/coverage diagnostics |
| Transformation | 40 s | Source views, registered reconstruction, stylized chunk, and separate play mask |
| Unknown means excluded | 20 s | A hole remains outside play; the compiler refuses an impossible shortcut |
| Multiplayer exchange | 45 s | Pulse, Sweep/Graph Sweep, acknowledged Freeze, and mutual catch on that world |
| Update and ambition | 25 s | Close a path, preview a new chunk version, explain the campus-to-platform direction |

That is a three-minute narrative. If processing takes longer than the presentation, show a reproducible preprocessed result and label it. Do not stage an instant reconstruction animation as if it were an actual latency measurement.

## 22.2 Three honest demo configurations

**GPS-only demo:** real participant movement on a basic map, explicit screen-visible or native support status, and the correct multiplayer loop. Present the spatial pipeline as the next milestone, not as implemented.

**Hybrid demo:** a real captured patch processed beforehand, a live GPS game, and a creator/reviewer view that shows the evidence lineage. This is the strongest near-term showcase for the vision.

**Full thin slice:** begin a short capture, upload it, run an incremental job, review a small patch, publish a manifest, and load it in a new match. Keep a preprocessed fallback for network or compute failures. This demonstrates a complex system without claiming the whole campus is finished.

## 22.3 AI's useful place in the project

Coding assistance can accelerate capture adapters, the rules engine, pipeline orchestration, shaders, tests, and debugging. In the product, computer-vision models can propose masks, semantic labels, and change candidates. A language model can draft missions constrained to existing landmark IDs or explain a QA report. These have different roles and should not all be described vaguely as "AI mapping."

Structured mission output still requires graph validation and human publication approval [S15]. Neither a language model nor a segmentation label decides whether a real path is permitted. Do not send raw live player routes to an AI system merely to make a recap.

For the showcase, explain what was generated, what was measured, what is deterministic, and what remains research. A reviewable reconstruction dataset and a repeatable compiler test are stronger technical evidence than an unsupported claim of perfect autonomous scanning.

## 22.4 The specific ask

Bring concrete requests: review the world schema and registration strategy; critique the route/coverage compiler; help benchmark native capture and mobile rendering; test the spatial mode; or connect the project with mapping and computer-vision collaborators. If you show ECHO working on a real captured patch, the ambition becomes assessable rather than just a list of futuristic features.

# 23. Product requirements and acceptance examples

| ID | Requirement | Acceptance example |
| --- | --- | --- |
| G01 | One ruleset and arena version per round | Changing a draft cannot alter a running match |
| G02 | Server-authoritative clocks | Changing a phone clock does not extend a freeze |
| G03 | Scheduled approximate disclosures | At 01:30, hunter sees a cell and sample age, never a raw stream |
| G04 | Correct recipient projection | Runner cannot inspect another player's raw location in any payload |
| G05 | Fair Freeze transaction | Timeout restores the reserved item and emits no caster reveal |
| G06 | Honest Sweep | Missing fixes produce unavailable status, not an "all clear" |
| G07 | Atomic station collection | Two requests for the same station yield exactly one item grant |
| G08 | Mutual capture | Unconfirmed request cannot mark a runner captured |
| G09 | Safety pause | Any participant can pause without majority approval |
| G10 | Technical recovery | Reconnect reconstructs remaining timers and authorized evidence only |
| G11 | Withdrawal | Local sampling stops even when offline |
| G12 | Retention enforcement | Expired raw coordinates disappear from the operational store and queues |
| G13 | Accessible baseline | Critical status is understandable without relying only on color or sound |
| G14 | Explicit mode limits | Browser demo cannot accidentally be advertised as a supported locked-screen chase |
| G15 | No privilege advantage | A playing host receives the same gameplay information as their role |
| G16 | Session-bound credentials | A removed member cannot keep receiving future channel messages |

A feature is done when its normal path, rejection path, disconnect path, and privacy boundary are demonstrated. A green success screen alone is not an acceptance test.


## 23.1 Spatial platform requirements

| ID | Requirement | Acceptance example |
| --- | --- | --- |
| W01 | Evidence is synchronized and interpretable | A bundle declares calibration, timestamps, units and pose conventions |
| W02 | Observation is separate from traversal | A camera-visible facade/lawn does not automatically enlarge the play mask |
| W03 | Unknown territory is excluded | An unobserved hole survives compilation and blocks a route query |
| W04 | Registration is evaluated independently | Held-out controls expose a rotated or shifted chunk |
| W05 | Appearance does not define permission | A hole-filled mesh cannot create a legal bridge |
| W06 | Publication is atomic and versioned | Mixed transform/graph/mesh hashes cannot start a round |
| W07 | Spatial mechanics use real compiled topology | Graph Sweep differs from an equal-radius Euclidean query across a barrier |
| W08 | Localization expresses uncertainty | Wrong-place imagery does not produce a trusted precise interaction |
| W09 | Assets degrade safely | Missing decorative LOD uses a proxy; missing authority blocks readiness |
| W10 | World updates preserve match rules | New geometry publishes between rounds; a closure only restricts visibly |
| W11 | Private evidence stays private | Normal player credentials cannot download raw survey frames or reference indexes |
| W12 | Derivative deletion is implementable | Removing sensitive source evidence identifies dependent textures/splats/features |
| W13 | Creator work is reusable | A new campus uses data and reviewed workflow, not a source-code fork |
| W14 | The full loop is demonstrable | A real permitted capture becomes the exact chunk used by a real match |

# 24. Hard decisions and research risk register

## 24.1 Architectural commitments

| Decision | Recommended direction | What could change it |
| --- | --- | --- |
| Product identity | Scan-to-play world platform with manhunt as the first game | Evidence that creator demand is weaker than a different captured-world use case |
| Demo client | React/MapLibre GPS client on the same protocol | Existing Unity expertise makes one native path faster |
| Flagship client | Unity/C# with native location/capture plugins and AR Foundation | A rendering spike shows a native map/custom-renderer stack better meets the actual visual target |
| Canonical world | Owned evidence, transforms, play artifacts, stable IDs and manifest | No reason to outsource the authority schema to a scan vendor |
| Reconstruction | COLMAP/pycolmap RGB path plus optional RGB-D/Open3D branch | Measured datasets favor a different engine with acceptable rights and exportability |
| World appearance | Stylized tiled meshes plus selective high-detail assets | Measured splat renderer quality/performance supports a broader appearance role |
| Precise interactions | Deliberate stopped relocalization with uncertainty | Device tests and actual mechanic requirements |
| Territory rule | Unmapped / unverified space stays outside play | Only an explicitly separate demo permit mask, never silent expansion |
| Live state | Authoritative server, world-version pin, restriction overlays | Scale can change ownership implementation, not the information contract |

## 24.2 Risk and resolution evidence

| Risk | Symptom | Required response / evidence |
| --- | --- | --- |
| Camera walk mistaken for complete scan | Roofs and hidden routes appear invented | Preserve unknown masks and evidence lineage; do not publish inferred access |
| Drift / scale error | Chunks overlap incorrectly or paths misalign | Loop constraints, control references, held-out residual tests |
| False loop closure | Repeating corridor matches the wrong place | Geometric verification, geographic priors, multi-view support, review |
| Appearance mistaken for authority | A hole-filled mesh creates a legal bridge | Independent play compiler and adversarial gap tests |
| Geometry mistaken for current reality | A scanned gate is open in the model but shut physically | Closure reports and freshness metadata; new observation/review |
| Visual localization overpromised | Old image or wrong facade resolves incorrectly | Confidence gates, pose plausibility, retry/fallback, no automatic capture |
| Reconstruction costs grow without limit | Repeated jobs reprocess entire campus | Chunking, content-addressed cache, GPU timeouts, per-world budgets |
| Asset updates break gameplay | Landmark IDs or graph edges vanish mid-match | Stable IDs, manifest pinning, migrations between rounds |
| Scans expose people or private spaces | Faces/interiors appear in textures or localization references | Restricted acquisition, redaction, review, derivative rebuild/deletion workflow |
| Mobile fidelity drains battery | Thermal throttling, missed alerts, high memory | LOD budgets, render throttling, camera-off play, real device profiling |
| Spatial mechanics add no value | Players only follow familiar GPS dots | Compare decisions with graph mechanics on the same group and arena |
| Background game state is unreliable | Stale fixes or missed Freeze offers | Native lifecycle work, device matrix, measured offer window, pause policy |
| Scope gets fragmented | Many experiments but no capture-to-match result | Protect one end-to-end patch and explicit subsystem contracts |

## 24.3 Open questions worth real engineering effort

Which capture quality can ordinary student phones sustain? How much alignment effort is needed per district? Which proxy representation preserves recognition while rendering cheaply? Can a local reference database support useful stopped localization across changing light? How often must operational edges be reverified? Which spatial power produces a decision impossible on a generic GPS map?

These are the project's interesting engineering questions. They should remain visible in the roadmap and validation, rather than being removed to make the architecture look easy.

# 25. Research notes and primary sources

Platform documentation was checked on **30 October 2026**. These links support specific factual constraints and implementation options. Product parameters, UX recommendations, schedules, and budget envelopes are proposals. Documentation changes; pin and retest the actual SDK versions used for the build.

| Ref | Source | Why it matters |
| --- | --- | --- |
| S01 | W3C, Geolocation specification: https://www.w3.org/TR/geolocation/ | Visible-document constraints, permission, timestamp and accuracy concepts; basis for limiting the browser demo |
| S02 | Android Developers, Access location in the background: https://developer.android.com/develop/sensors-and-location/location/background | Background access and update limitations; permission rationale |
| S03 | Apple Developer, Handling location updates in the background: https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background | Native background capability and lifecycle requirements; use current platform-specific guidance |
| S04 | MapLibre GL JS, Display buildings in 3D: https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/ | Extruded-polygon rendering reference for the 2.5D map |
| S05 | OpenStreetMap, Copyright and License: https://www.openstreetmap.org/copyright | Data attribution and licensing obligations; distinguish data rights from tile service access |
| S06 | OpenStreetMap Foundation, Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/ | Public tile servers prohibit bulk prefetch and offline packages |
| S07 | Expo Location: https://docs.expo.dev/versions/latest/sdk/location/ | Development builds, background setup, platform permission differences, lifecycle limits |
| S08 | MapLibre React Native, Getting Started: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/ | Native renderer, compatibility requirements, production style/tile sourcing |
| S09 | Supabase, Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security | Database access control; not a substitute for recipient-specific game views |
| S10 | Supabase, Realtime Authorization: https://supabase.com/docs/guides/realtime/authorization | Private Broadcast/Presence channel access must be designed explicitly |
| S11 | Ravensburger, Scotland Yard: https://www.ravensburger.co.uk/en-GB/products/games/strategy-games/scotland-yard-game-smart-choice-22991 | Primary-source pursuit-game reference, not a novelty claim |
| S12 | Geocaching Adventure Lab: https://adventure.geocaching.com/ | Primary-source reference for authored place-based waypoint experiences |
| S13 | BITS Goa archival campus information PDF: https://universe.bits-pilani.ac.in/uploads/campusinfo.pdf | Search index exposes a 2012 map; direct fetch returned 404 during research. Historical orientation reference only; no current route or permission claim relies on it |
| S14 | Firebase, Set the lifespan of a message: https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan | Acceptance is not delivery; delayed and expired notifications need explicit handling |
| S15 | OpenAI, Structured model outputs: https://developers.openai.com/api/docs/guides/structured-outputs | Optional structured mission drafts, followed by deterministic validation and human approval |
| S16 | PostGIS, ST_DWithin: https://postgis.net/docs/ST_DWithin.html | Meter-based geography queries and spatial-index support |
| S17 | Colyseus documentation: https://docs.colyseus.io/ | Alternative authoritative room-based multiplayer framework |
| S18 | MapLibre React Native, Expo Setup: https://maplibre.org/maplibre-react-native/docs/setup/expo/ | Native module setup and development-build workflow; verify against chosen SDK |
| S19 | Fastify documentation: https://fastify.dev/docs/latest/ | HTTP service framework; implementation choice, not a performance guarantee |
| S20 | Socket.IO documentation: https://socket.io/docs/v4/ | Event transport and reconnect tooling; application receipts still required |
| S21 | QGIS User Guide: https://docs.qgis.org/latest/en/docs/user_manual/ | Desktop geometry authoring and projection workflow |
| S22 | Supabase, PostGIS extension: https://supabase.com/docs/guides/database/extensions/postgis | Managed PostgreSQL geospatial setup |
| S23 | Expo Notifications: https://docs.expo.dev/versions/latest/sdk/notifications/ | Native notification integration and platform-specific setup |
| S24 | Hunting Game official product page: https://www.hunting-game.com/ | Primary GPS-manhunt baseline; site links App Store ID 6471968553; avoid conflating similarly named listings |
| S25 | Hunting Game official rules: https://www.hunting-game.com/how-to-play-manhunt-in-real-life | Role loop, Play Zone, timed updates, catch code and role-specific powers |
| S26 | Manhunt IRL FAQ: https://manhuntgame.com/faq | Fuzzy pings, heartbeat, jailbreak, confirmation and browser foreground requirements |
| S27 | SCRAM developer listing: https://play.google.com/store/apps/details?id=com.scram.app | Head start, timed age-labelled pings, team visibility and zone controls; indexed listing retrieved, direct open was unavailable |
| S28 | Hunting Game: Manhunt, Jacob Schubert: https://apps.apple.com/in/app/hunting-game-manhunt/id6809603844 | Separate radar/power-based manhunt product; not the hunting-game.com listing |
| S29 | Google ARCore Depth: https://developers.google.com/ar/develop/depth | Supported-device depth, motion-based estimation and local depth constraints |
| S30 | Apple ARKit scene reconstruction: https://developer.apple.com/documentation/arkit/visualizing-and-interacting-with-a-reconstructed-scene | LiDAR-assisted local mesh reference; provider capability differs from universal phone support |
| S31 | COLMAP tutorial: https://colmap.github.io/tutorial.html | SfM and multi-view stereo reconstruction pipeline and capture considerations |
| S32 | COLMAP FAQ: https://colmap.github.io/faq.html | Calibration groups, priors, model merging and geographic registration |
| S33 | Open3D RGB-D integration: https://www.open3d.org/docs/release/tutorial/pipelines/rgbd_integration.html | Depth/pose fusion and TSDF reference implementation |
| S34 | Kerbl et al., 3D Gaussian Splatting: https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/ | Appearance / radiance-field rendering research; no implication of navigation authority or instant reconstruction |
| S35 | Niantic Spatial Capture and Scaniverse: https://www.nianticspatial.com/products/capture | Candidate capture/reconstruction toolchain; confirm actual account, private-data and export capabilities before use |
| S36 | Niantic Spatial VPS2: https://www.nianticspatial.com/docs/nsdk/features/vps2/ | Current mapped-Site localization, coordinate/anchor state, and geo-alignment distinctions |
| S37 | Google ARCore Geospatial: https://developers.google.com/ar/develop/geospatial | Provider visual coverage and global positioning; no assumed campus coverage |
| S38 | hloc, Hierarchical Localization: https://github.com/cvg/Hierarchical-Localization | Image retrieval, feature matching and map-relative pose research/tooling |
| S39 | Unity AR Foundation: https://docs.unity.com/en-us/engine/6000.0/manual/packages-list/packages-all/pack-safe/com-unity-xr-arfoundation | Cross-platform AR abstraction; select a tested compatible version set |
| S40 | Unity ARKit provider: https://docs.unity.com/en-us/engine/6000.0/manual/packages-list/packages-all/pack-safe/com-unity-xr-arkit | Apple native AR integration and provider features |
| S41 | Unity ARCore provider: https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.0/manual/index.html | Android AR provider integration; capabilities checked per device and package |
| S42 | meshoptimizer: https://github.com/zeux/meshoptimizer | Mesh optimization and gltfpack-style derivative preparation |
| S43 | Temporal workflows: https://docs.temporal.io/workflows | Durable orchestration for asynchronous spatial jobs and review waits |
| S44 | ORB-SLAM3: https://github.com/UZ-SLAMLab/ORB_SLAM3 | Visual/inertial multi-map SLAM research option; repository identifies GPL-3.0 |
| S45 | Fastify WebSocket plugin: https://github.com/fastify/fastify-websocket | Standard WebSocket transport option for web and native client adapters |
| S46 | ONNX Runtime: https://onnxruntime.ai/docs/ | Evaluated model inference runtime option; model quality and licences remain separate |

The architectural recommendations in the next section combine these capabilities with original engineering judgments. No source establishes that BITS Goa has already been scanned, that provider VPS coverage exists there, or that campus access, GPS reception and player demand have been validated. Competitor features are documented claims, not hands-on test findings. Reviewed pages can differ by platform/version; the actual reel remains unidentified without a link.

# 26. Full tools, technology stack and implementation architecture

## 26.1 Recommended technology stack and subsystem ownership

The flagship has three substantial systems: **a native spatial client**, **an authoritative multiplayer service**, and **an asynchronous world-building pipeline**. The first GPS demo can be a web client against the same protocol. Their contracts are shared; their runtimes do not need to be identical.

The recommended flagship renderer/capture host is **Unity/C# with AR Foundation and native Swift/Kotlin extensions**. This is an architectural choice driven by the scanned-world, shader, LOD, and AR requirements. It is not mandatory for the GPS demo, and it is not a claim that Unity automatically solves background GPS, device capabilities, or reconstruction.

| Subsystem | Recommended tools / languages | Responsibility | Boundary / reason |
| --- | --- | --- | --- |
| GPS demo + web editor | React, TypeScript, Vite, MapLibre GL JS; Three.js for scan QA views | Basic GPS play, manifest inspection, review tools | Foreground browser mode only for live location; shader/asset viewer separate from rules |
| Flagship client | Unity, C#, URP, runtime UI, asset-streaming adapter | Tilted world, creator view, LODs, game HUD, stopped AR | Native world renderer without pretending the engine is the referee |
| AR abstraction | AR Foundation with ARKit/ARCore provider plugins | Camera, poses, anchors, available depth/mesh interfaces | Provider support differs; runtime capability detection [S39-S41] |
| Native capture adapters | Swift/ARKit and Kotlin/ARCore, thin C#/native bridge | Exact calibration, image/depth metadata, efficient recording | Fill gaps in provider APIs; avoid copying full camera frames through UI code |
| Native location/alerts | Swift Core Location, Kotlin Android location service APIs, APNs/FCM integration | Session-scoped background locations and alerts | OS lifecycle is explicit; no dependence on a background game render loop [S02, S03, S14] |
| Capture manifest | JSON schema + binary/image objects | Timestamps, calibration, poses, units, consent/provenance | Immutable evidence bundle with content hashes |
| Spatial control API | Python/FastAPI | Capture ingest, job submission, QA artifacts, publication requests | Not the hot gameplay referee |
| RGB reconstruction | COLMAP/pycolmap, C++/Python worker image | Camera solutions, sparse model, dense geometry branch | Tested pinned worker profile, not an arbitrary latest install [S31, S32] |
| RGB-D fusion | Open3D, Python/C++ | Depth/pose registration, filtering, TSDF-based experiments | Depth and calibration quality are prerequisites [S33] |
| Stylization and preparation | Open3D, Blender batch tools, meshoptimizer/gltfpack | Simplification, materials, LODs, geometry optimization | Preserve gameplay boundaries separately from visual simplification [S42] |
| Optional splat appearance | Chosen 3DGS implementation + measured renderer/export adapter | High-detail captured-world views | Licence, mobile cost and derivative privacy review; no collision authority [S34] |
| Vision inference | Evaluated segmentation/change models, ONNX Runtime where appropriate | Candidate masks, semantic suggestions, redaction | Model-specific validation and weight licences, human review [S46] |
| Owned visual localization | hloc-style retrieval + feature matching + pose estimation | Map-relative pose against ECHO reference captures | Research/advanced branch; benchmark before competitive use [S38] |
| Hosted localization option | Niantic Spatial VPS2; ARCore Geospatial where coverage permits | Provider-based map pose / anchors | Access, privacy, cost and coverage are explicit; no assumed BITS availability [S36, S37] |
| Orchestration | Temporal for durable spatial workflows; explicit CPU/GPU workers | Retryable reconstruction/compile DAG and review waits | Activities do compute; workflow history stores references, not image blobs [S43] |
| Game service | Node.js, TypeScript, Fastify | Match ownership, deadlines, validated commands, projections | Deterministic rules; independent of GPU jobs [S19] |
| Live transport | Standard WebSocket via @fastify/websocket, C#/web adapters, HTTPS fallback | Live safe events, command receipts, snapshots | Plain WebSocket and Socket.IO are different wire protocols; choose one [S45] |
| Primary database | PostgreSQL/PostGIS, managed or self-hosted | Spatial masks, topology, world versions, game state | Separate private evidence, public assets and gameplay access [S09, S16, S22] |
| Identity | Session-capable auth provider; Supabase Auth is a practical option | Creator ownership, private roster and device-session control | Stable account does not imply permanent tracking |
| Blob storage / CDN | S3-compatible object storage plus versioned delivery | Capture objects, masters, compiled chunks, manifests | Signed evidence access; only approved assets public as intended |
| Cache / ownership scale | Redis if justified, plus DB fencing/leases | Hot cache, routing and coordination | Not an excuse for two authoritative owners |
| Geographic QA | QGIS, metric projection tools, control-reference dataset | Alignment, coverage review, map validation | Ground truth and access review remain independent |
| Testing | TypeScript rule tests, Python geometry tests, Unity tests, native device tests | Invariants, spatial fixtures, performance and lifecycle | Test real data and failure paths, not only mock sensors |
| Observability | OpenTelemetry-style traces, metrics dashboards, redacted exception reporting | Match latency, GPU jobs, compiler provenance, cleanup lag | No unfiltered camera/coordinate payloads in logs |
| Reproducibility | Git, lockfiles, versioned schemas, containerized workers, asset hashes | Repeatable reconstruction, compilation and rollback | Version code, models, calibration and inputs together |

The final manifest is the interface between the spatial pipeline and the game. The game service can run while reconstruction is offline, and the scanner can collect evidence while no match exists. Avoid turning these into a monolith just because one founder writes the first version.

## 26.2 Client strategy and native lifecycle

Use a GPS web demo if it accelerates the first multiplayer test. Its limitations are explicit: browser visibility and location lifecycle make it unsuitable as a promise of reliable pocketed-phone play [S01]. The production client is native. Unity's render loop, a background-service flag, or a WebSocket library does not override mobile OS suspension rules.

Implement a native session manager that starts and stops the platform location service, sends short authenticated HTTPS location/health uploads when permitted, posts or receives appropriate notifications, and stores only a bounded encrypted retry queue. It communicates state to the foreground Unity client when active. If Unity is suspended, the server should still understand whether valid native uploads are arriving; if they stop, the technical-pause policy applies.

Capture uses the camera in an explicit foreground survey session. Normal chase uses the camera off, except for deliberate stopped relocalization or station interactions. Separate capture consent, background player-location consent, and optional localization-provider imagery. A mapping session should not accidentally start a game-tracking session or vice versa.

A React Native/Expo player remains a viable alternate renderer if the selected world representation is adequately handled by a native map or custom module. The choice should follow a rendering/capture spike, not an assumption that development must be simple. The default described here commits to the spatial-game-engine route while preserving protocol independence.

## 26.3 Build-versus-buy and research alternatives

| Component | Fast validation route | Owned / deeper route | Decision criterion |
| --- | --- | --- | --- |
| First scan | Evaluate Scaniverse or another permitted export [S35] | Native synchronized capture bundle | Export rights, transforms, metadata, privacy and repeatability |
| Local tracking | ARKit/ARCore provider poses | Offline visual-inertial research pipeline | Proven tracking gap rather than desire to rewrite SLAM |
| SLAM research | Benchmarks and replayed captured datasets | ORB-SLAM3 or another evaluated stack [S44] | Calibration, performance, integration and licence constraints |
| Reconstruction | Pinned COLMAP profile / import adapter | Custom multi-session optimization and fusion | Quality and control over the actual campus data |
| Localization | Known reviewed anchor / optional hosted VPS | ECHO-owned reference database and hloc-style service | Coverage, false matches, latency, privacy, cost and control |
| Appearance | Simplified meshes from registered scans | Hybrid splats / learned abstraction | Mobile budget and visual identity without changing authority |
| Multiplayer | One serial owner per match | Distributed routing with leases and fencing | Measured concurrency and recovery needs |
| Workflow | One durable queued job for the first patch | Temporal DAG with resumable activities | Repeated heavy jobs, retries, review waits and lineage |

Niantic's current docs direct new projects toward VPS2 and Scaniverse Sites rather than assuming the legacy Geospatial Browser workflow. ARCore Geospatial depends on provider coverage and visual data; it is not a generic API for importing an arbitrary private campus model [S36, S37]. An ECHO-owned localizer is a different engineering branch, not a configuration flag on those services.

Use dependency and model licence inventories. ORB-SLAM3's repository identifies GPL-3.0; that makes it an explicit licensing/integration decision rather than a drop-in default [S44]. Review algorithm code, model weights, asset exports, scanning terms, and derivative redistribution independently.

## 26.4 System topology and trust boundaries

The game plane has four distinct flows. The separate spatial plane in sections 26.20-26.36 produces its versioned world inputs:

1. **Published world content:** the spatial compiler and reviewer produce a verified manifest; object storage serves the compatible immutable play artifacts and appearance assets.
2. **Private player inputs:** foreground commands and background location uploads arrive at an authenticated game service. The service derives the actor from the credential, not from a supplied player ID.
3. **Authoritative state:** one owner processes a match's deadlines and commands, persists critical changes, and produces permitted per-recipient views.
4. **Delivery:** live events reach active clients through the socket; push provides a best-effort alert; HTTPS snapshot retrieval reconstructs the current authorized state on reconnect.

The mobile app is untrusted. The game service is trusted for rules. PostgreSQL is the durable source for critical state. The push service transports notifications without deciding outcomes. The content generator can produce drafts but has no authority to alter a live match or publish an arena.

A shared public match channel may carry phase, timer, and coarse team counts. Private participant channels carry inventory receipts and permitted disclosures. Raw location never enters the public channel. Clients cannot send arbitrary server broadcasts. If Supabase Realtime is introduced, configure its channel authorization separately from database RLS and explicitly revoke or reauthorize access after role changes [S09, S10].

## 26.5 Match ownership and the rules engine

Represent rules as a pure transition function receiving current state, a validated command or due deadline, and an authoritative time. It returns a new state, internal events, and intended disclosures. A separate projector determines which recipient may receive each disclosure.

Use one serial command queue per match. For the pilot, one service process can own every small match. This avoids distributed races. It still needs a database transaction and a unique idempotency record for each accepted command. Before adding multiple service instances, introduce a real ownership lease and fencing token so two owners cannot both resolve the same station or pulse.

Do not rely on one in-memory `setTimeout` as the only record of a match deadline. Persist the phase, active elapsed time, remaining timers, next pulse index, and critical effect state. A scheduler evaluates due events against the authoritative timeline. Late wake-up processes each due event once in deterministic order; it does not emit a burst of stale location reveals after an outage.

On restart, mark affected matches recovery-paused. Cancel unacknowledged Freeze offers and release reservations. Rebuild durable inventory/capture state. Require fresh locations and client synchronization before resuming. Do not silently continue an unobserved chase while the referee was offline.

## 26.6 State machines

| Entity | Main states | Key transitions |
| --- | --- | --- |
| Match | DRAFT, LOBBY, READINESS, HEAD_START, ACTIVE, PAUSED, FINISHED, CANCELLED | Host start after readiness; pause from any live phase; end at deadline or complete catch |
| Participant | READY, ACTIVE, CAPTURE_ENCOUNTER, CAPTURED, UNAVAILABLE, WITHDRAWN | Capture requires confirmation; health failure becomes unavailable; withdrawal is terminal for round |
| Freeze effect | RESERVED, OFFERED, ACTIVE, EXPIRED, CANCELLED | Acknowledgement consumes item and starts effect; timeout restores reservation |
| Item | OWNED, RESERVED, CONSUMED, DISCARDED | Atomic reservation prevents double use |
| Station | AVAILABLE, CLAIM_IN_PROGRESS, COOLDOWN, DISABLED | Server commit grants exactly one reward; pause suspends hold and clears attempt |
| Capture | REQUESTED, CONFIRMED, CONTESTED, EXPIRED, CANCELLED | Only confirmed before deadline changes capture state |

Model physical status and connectivity separately. A frozen hunter can simultaneously become unavailable. A captured runner remains captured even after their app reconnects. Flattening all of these into one overloaded `status` string makes edge cases brittle.

## 26.7 Core data model

| Table / collection | Important fields | Access rule |
| --- | --- | --- |
| profiles | user_id, alias, preferences | User and minimal roster projection |
| arenas | id, owner, display_name, publication_state | Published public metadata |
| arena_versions | id, arena_id, content_hash, geometry_refs, source_licences, inspection_date | Immutable published bundle; private notes elsewhere |
| ruleset_versions | id, validated_config, hash | Readable rules, locked for match |
| matches | id, arena_version_id, ruleset_version_id, phase, clock_state, owner_epoch, result | Participant projection; server writes |
| match_members | match_id, user_id, role, capture_state, health_state, consent_version | Roster projection hides private identity fields |
| device_sessions | member_id, token_epoch, device_binding, expires_at | Server-only credential control |
| latest_locations | member_id, geography, accuracy_m, measured_at, received_at, sequence, expires_at | Server-only; no ordinary client select |
| location_quality_buffer | member_id, bounded samples, expiry | Short TTL, no route archive |
| item_instances | id, owner_member_id, type, state, reserved_by | Own inventory projection; server writes |
| effects | id, source, target, phase, remaining_ms, immunity_deadline | Minimum affected-recipient projection |
| station_states | match_id, station_id, availability, respawn_remaining | Public availability; private claim details |
| capture_requests | id, hunter, runner, challenge_hash, expiry, outcome | Encounter participants and restricted steward |
| command_receipts | actor, command_id, request_hash, outcome, event_seq | Actor sees their receipt |
| gameplay_events | match_id, sequence, event_type, redacted_payload, created_at | Server audit; coordinate-free by default |
| recipient_disclosures | recipient, source_event, coarse_geometry, sampled_at, expires_at | Recipient only; short retention |
| outbox | event_id, recipient_scope, safe_payload, delivery_state | Server-only durable delivery queue |
| incident_records | id, reason, access_audit, minimal evidence, retention_policy | Restricted operational process |

Add unique constraints such as `(actor, command_id)`, `(match_id, sequence)`, and one station-state row per `(match_id, station_id)`. Use foreign keys for match membership and arena references. RLS should be restrictive even if clients normally use the game service. Raw location belongs in a schema or API surface inaccessible to ordinary app tokens.

Critical actions persist inventory/capture changes, the internal event, command receipt, and safe outbox entries in one transaction. Delivery happens after commit. If the socket send fails, the client can retrieve the same receipt or projected state without repeating the action.

## 26.8 Commands, receipts, and transport

The command envelope is intentionally small:

```json
{
  "commandId": "opaque-unique-id",
  "matchId": "match-id",
  "sessionEpoch": 4,
  "expectedRevision": 128,
  "type": "USE_FREEZE",
  "payload": {
    "itemInstanceId": "item-id",
    "targetMemberId": "hunter-member-id"
  }
}
```

The server resolves the sender from authentication. A supplied target ID is validated against the roster. `expectedRevision` helps detect stale screens; it is not a replacement for checking current state and should not unnecessarily reject harmless concurrent actions.

Every command returns `ACCEPTED`, `PENDING`, or `REJECTED`, a stable event/receipt ID, current revision, server time, and a machine-readable reason if needed. Reusing an ID with a different request body is rejected. A retry with the same ID and body returns the original result. The UI must not create new IDs automatically when retrying a timeout.

| Interface | Purpose | Important behavior |
| --- | --- | --- |
| POST /matches | Create private lobby | Server validates preset and arena version |
| POST /matches/:id/join | Request membership | Rate-limited; host approval where configured |
| POST /matches/:id/commands | Submit game command | Same validation as socket commands |
| POST /matches/:id/location | Upload bounded location batch | Accept only active, authorized session; reject stale sequence |
| GET /matches/:id/view | Reconstruct authorized snapshot | Includes only recipient-permitted evidence |
| GET /matches/:id/receipts/:commandId | Recover uncertain command result | Actor-scoped and idempotent |
| POST /matches/:id/leave | Withdraw and revoke session | Stops future disclosures; cleanup requested |
| Socket events | Timely state changes for active app | Never assume delivery equals human perception |

There is no public `GET /all-player-locations` endpoint. Editor APIs are separate from gameplay APIs and cannot mutate published active versions.

## 26.9 Location ingestion and geospatial calculations

Start with a requested update cadence around 3-5 seconds during active movement and a less aggressive cadence while stationary, subject to field measurements. The OS may batch or delay updates. This request is not a supported-rate guarantee. Do not configure a one-second high-accuracy loop merely because a reel looks fast; measure battery and freshness on real phones.

Each upload contains sequence number, measured time, coordinates, reported horizontal accuracy, and current session epoch. Validate bounds, finite numbers, plausible timing, maximum batch size, permission state, current membership, and monotonic sequence. Never use a newly received old measurement as a fresh one. Compare both measured and received times; client timestamps are not a trustworthy anti-cheat proof.

Use WGS84 for exchange and storage, a suitable local metric projection for arena geometry work and grid quantization, and PostGIS `geography` for meter-based radius queries. `ST_DWithin` accepts meters for geography; geometry distance uses the spatial reference system's units [S16]. A degree-based distance check against a 100 m constant is a serious bug.

For Sweep, compute a conservative operational uncertainty band around the estimated separation: let estimated distance be `d`, and use `e = hunter_accuracy + runner_accuracy`. A signal is clearly in-range when `d + e <= radius`, clearly out when `d - e > radius`, and uncertain otherwise. This is a product heuristic, not a formal confidence interval. Render boundary uncertainty honestly.

For station membership, test the approved collection patch and repeated acceptable readings. Use human/QR checkpoint alternatives only where appropriate. Do not use a 3 m GPS gate for captures. A map-matching algorithm can improve display but must not snap someone across a barrier or create authoritative proof they were on a permitted path.

Store raw measurements only for the short operational lifetime described earlier. Create coarse disclosures when an event authorizes them; do not store a full raw route just because a later replay sounds appealing.

## 26.10 Freeze and Sweep implementation sketch

The following is pseudocode, not a complete API implementation:

```text
useFreeze(command, actor, now):
  processDueDeadlines(now)
  require activeMatch and actorIsActiveRunner
  require validOwnedItem and acceptableCasterLocation
  require targetIsActiveHunter and targetIsReachable
  require noTargetFreezeOrImmunity
  transaction:
    reserveItem(command.id)
    createOffer(expiry = now + offerWindow)
    recordReceipt(PENDING)
    enqueueTargetOfferWithoutCasterCoordinates()

acknowledgeFreeze(offer, target, now):
  processDueDeadlines(now)
  require liveOffer and correctTarget and bothStillEligible
  transaction:
    consumeReservedItem()
    startFreeze(remaining = 8 chaseSeconds)
    createCoarseCasterDisclosureForActiveHunters()
    recordActivationAndSafeOutbox()

expireOffer(offer):
  transaction:
    releaseReservation()
    recordCancellationWithoutCasterDisclosure()

useSweep(command, hunter, now):
  processDueDeadlines(now)
  require activeEligibleHunter and freshHunterFix
  computeEligibleRunnerSignals()
  if no usable runner signals:
    rejectWithoutSpending(SCAN_UNAVAILABLE)
  else transaction:
    consumeItemAndStartCooldown()
    classifyRangeAndUncertainty()
    createRecipientSpecificCoarseResult()
    notifyOnlyRunnersActuallyDisclosed()
```

All revalidation and persistence must happen within the match's serialized ownership/transaction discipline. The sketch omits authentication, schema validation, locks, idempotency, rate limiting, and retries, which are mandatory in the real implementation.

## 26.11 Time model, event ordering, and recovery

Maintain an active-time clock for gameplay and a wall clock for receipts, offer expiry, capture confirmation, and operational recovery. Keep those domains explicit in field names. Pause freezes gameplay intervals but cancels unacknowledged offers and unresolved capture requests for review, so wall-clock expiries cannot create actions during a pause.

At every command, advance due match transitions first. At chase end, stop all new gameplay. Persist a pulse's index and event ID so a retry cannot reveal a runner twice. If the process was unavailable for multiple pulse intervals, pause recovery rather than creating historical revelations from newly measured positions.

A reconnect handshake supplies the last seen event sequence. The server authenticates the new session, checks current role, and returns the latest authorized snapshot plus any still-valid receipts. It does not replay expired coordinates or effects simply to fill an event gap. Deliver state before decorative animations. Reject an old device session after a device switch.

## 26.12 GPS-demo arena configuration and baseline rules

The GPS demo can use this lightweight arena manifest and separate GeoJSON layers. The flagship publication uses the richer world manifest in section 26.30; these are stages of the same world-version contract. Names are illustrative and real coordinates are intentionally omitted.

```yaml
arenaId: bits-goa-pilot
version: 1
status: draft
contentHash: generated-at-publication
surveyedAt: to-be-verified
coordinateExchange: WGS84
metricFrame: selected-and-recorded-during-survey
layers:
  buildings: buildings.geojson
  paths: paths.geojson
  walkable: walkable.geojson
  exclusions: exclusions.geojson
  stations: stations.geojson
operatingWindow: approval-required
meetingPointId: meeting-a
compatibleRulesets:
  - classic-signals-v1
```

```yaml
rulesetId: classic-signals-v1
headStartSeconds: 60
chaseSeconds: 1080
pulseIntervalSeconds: 90
pulseBrightSeconds: 12
disclosureMaxAgeSeconds: 90
disclosureCellMeters: 25
maxLocationAgeSeconds: 10
maxReportedAccuracyMeters: 25
technicalPauseAfterSeconds: 20
inventorySlots: 2
freeze:
  activeSeconds: 8
  offerWallSeconds: 5
  immunityChaseSeconds: 45
  revealCasterOnActivation: true
sweep:
  radiusMeters: 100
  brightSeconds: 8
  cooldownChaseSeconds: 60
station:
  holdSeconds: 3
  respawnChaseSeconds: 120
capture:
  confirmationWallSeconds: 15
  automaticGpsCapture: false
```

Validate the manifest and ruleset before publication. Do not allow an unbounded YAML file from an organizer to execute code or bypass core privacy/safety constraints. The first release should expose only a few approved presets.

## 26.13 Repository and contract layout

Use a monorepo or coordinated repositories with explicit schemas: `clients/unity`, `apps/demo-editor`, `services/game`, `services/spatial-api`, `workers/reconstruction`, `workers/compiler`, `packages/protocol`, `packages/world-schema`, `packages/rules`, `tests/spatial-fixtures` and `worlds/bits-goa`. Store private raw evidence in the appropriate controlled object store rather than in ordinary source control.

Generate compatible C#/TypeScript/Python boundary types from versioned schemas where practical, and keep runtime validation on every untrusted input. The authoritative game reducer remains on the server; the client does not become authoritative by sharing a type definition. Sensor/camera and pose math require executable cross-language fixtures, not only schema compatibility.

Build the multiplayer and spatial thin slices in parallel against the manifest contract. Synthetic demo fixtures are marked and cannot enter production capture/publication accidentally. A renderer swap does not change the meaning of a command, a disclosure, or the effective play mask.

## 26.14 Tests that protect the actual game

**Rules tests:** exact deadline collisions, Freeze acknowledgement after caster capture, item reservation expiry, immunity boundaries, scan with partial signals, match pause/resume, capture timeout, withdrawal, and end-of-round cleanup.

**Concurrency tests:** two station claimants; duplicate activation on two transports; reconnect retry after commit-before-delivery; old owner attempting a write after failover; role change while a disclosure is being delivered.

**Privacy tests:** a runner, hunter, captured participant, host, removed member, and spectator each attempt unauthorized reads and subscriptions. Inspect real payloads, not only visible markers. Assert that raw coordinates do not appear in ordinary events, logs, errors, notifications, or AI requests.

**Device tests:** screen lock, app background, permission denial/revocation, approximate location, battery saver, force stop, Wi-Fi/mobile-data transition, low reception, notification disabled, and delayed notification arriving after expiry. Document actual supported device/OS configurations.

**Map tests:** invalid polygons, disconnected station, path crossing an exclusion, inaccessible objective, missing attribution, stale version hash, and a visual layer obscuring a critical warning.

**Operational tests:** pause from every live state; backend restart; database unavailable; push unavailable; host disconnect; last runner disconnect; account/token removal; deletion job failure. The expected result must be explicit: fail closed, pause, or degrade visibly.

Add generative invariants where practical: inventory count never negative; one station claim grants at most one reward; a consumed item cannot activate again; a captured/withdrawn player cannot act; an unauthorized recipient never receives a disclosure; and elapsed chase time does not advance during a pause.

## 26.15 Observability and capacity planning

Measure accepted-location age, event delivery time, offer acknowledgement time, command rejection reasons, reconnect frequency, scheduler delay, station conflict rate, pause reasons, and cleanup lag. Separate gameplay latency from human response time. Use pseudonymous IDs and redaction at the source.

For a rough load example, 10 players uploading once every 5 seconds for 18 minutes produce `10 x 1080 / 5 = 2,160` location uploads, excluding head start, readiness, and retries. Ten simultaneous rounds at that cadence produce about 20 uploads per second. Those are arithmetic planning figures, not benchmark results.

Store only current location and the bounded quality buffer rather than appending every upload to a permanent event log. Pulse fan-out and targeted notifications add traffic, but the expected pilot scale does not justify microservices or a high-frequency physics server. Load-test the actual serialized transaction path and regional network latency before promising capacity.

## 26.16 Deployment, security, and rollback

Use separate development and pilot environments. Require TLS, scoped credentials, validated input schemas, rate limits, secure secret storage, database backups with documented expiry, and least-privilege service access. Keep database migrations under version control and test policy changes using each participant role.

Deploy the game service where long-lived connections and scheduled match ownership are supported. Choose a region based on measured latency and the data-handling decision, not a generic "nearest is always best" assumption. Use health checks and graceful draining: finish or visibly pause active matches before changing incompatible rule logic.

A release identifies the mobile build, protocol version, ruleset version, and arena content hash. Keep the previous compatible release available. If a privacy defect is found, disable new games and stop disclosures before fixing cosmetic issues. On restart or rollback, recover into a pause rather than inventing state.

Push payloads carry an event reference and expiry, not coordinates. A device retrieves current state with its credential. An old notification opening the app should produce the current match view, never a stale action sheet.

## 26.17 GPS-demo budget versus spatial-platform budget

For the basic closed GPS demo, an initial planning reserve around INR 1,000-5,000 per month can cover a small service/database/storage setup depending on provider and usage. This is a chosen planning envelope, not a current price quote or free-tier guarantee. Mobile distribution accounts, devices, mapping effort and paid licences are separate.

The spatial product adds evidence storage, reconstruction scratch space, CPU/GPU time, large-asset egress, localization-provider usage, sensor testing and human review. Model those from actual patch benchmarks using section 26.35. Do not carry a low-traffic GPS-hosting estimate forward as if it were the total cost of a campus reconstruction platform.

Temporal is justified by the durable spatial DAG; Redis may be justified by match routing/cache; a GPU worker is justified by measured reconstruction work. They solve different requirements. Adopt complexity for those concrete jobs and keep each boundary observable and replaceable.

## 26.18 AI authoring interface, if added

An optional mission draft request should contain a set of public approved landmark IDs, allowed objective templates, an approved path graph summary without player locations, and constraints such as maximum walking distance and excluded edges. The output references IDs and a schema, not free-form invented coordinates.

The pipeline is: generate draft, validate schema, validate graph reachability and allowed locations, check timing and mode compatibility, preview, human approve, then publish a new content version. Handle refusals, invalid output, and service failure by keeping the existing approved mission. Do not give the model a production database credential or a tool that can publish directly.

A post-round recap can consume redacted events such as "runner used Freeze" or "hunter confirmed capture," without raw route traces. Let players approve a shareable recap. Keep deterministic templates as a cheaper default and AI as an optional enhancement.

## 26.19 The multiplayer thin-slice milestone

Two real phones join a private match, receive different authorized views, advance a server-controlled clock, resolve a pulse, a Sweep, an acknowledged Freeze, a mutual capture, and a pause/reconnect, then stop session tracking at the end. This validates the referee and native lifecycle.

The spatial thin slice proceeds alongside it: capture, register, compile, review, publish, and load one real world chunk. The full acceptance at the end of this section connects those two milestones.

## 26.20 The capture data contract

A capture bundle must be sufficient to understand and reprocess the observations. Saving an MP4 and a GPX file without calibration or temporal correspondence is not the intended final design.

| Field group | Required information | Why it matters |
| --- | --- | --- |
| Identity / provenance | Capture ID, world/district proposal, creator, device profile, acquisition time, permission scope | Ownership and review lineage |
| Calibration | Intrinsic matrix, image dimensions, lens/distortion model, camera identifier, crop/orientation, calibration version | Correct rays and multi-view matching |
| Images | Keyframe object hashes, encoding, timestamp, exposure metadata where available | Reconstruction and privacy processing |
| Poses | Timestamped camera-to-session transforms, tracking state, frame convention, quality/covariance where available | Priors and association to local geometry |
| IMU | Timestamped acceleration/angular velocity with units and axis convention | Optional offline VIO research and motion diagnostics |
| Geographic priors | Latitude, longitude, altitude when available, horizontal/vertical quality, timestamp and height datum status | Coarse world registration, never exact control by default |
| Depth | Image, unit scale, confidence, intrinsics, depth-to-camera relation, timestamp, provider capability | RGB-D fusion and sensor-quality handling |
| Local mesh | Provider mesh observations and transforms where supported | Fast preview and reconstruction branch input |
| Anchors / controls | Reference identity, observation, survey method, quality, transform estimate | Alignment across sessions and future localization |
| Coverage | Inspected route observations separately from camera surface visibility | Prevent observed scenery from becoming traversable permission |
| Integrity | Schema version, per-object hashes, upload state, sensor-gap markers | Resumability, corruption rejection and reproducibility |

Use one monotonic session clock for sensor association and record its relation to wall-clock time. Preserve raw timestamp domains where the provider differs. Interpolate poses only when the motion and quality model justify it; reject a frame across tracking loss rather than assigning a convenient old pose.

Camera switching, digital zoom, stabilization crop, image rotation, resizing and depth alignment all affect calibration. If a frame is resized, update its intrinsic parameters consistently. If images are rectified, store the resulting camera model and transform. A visually plausible reconstruction can still be metrically wrong when this bookkeeping is missing.

A pose is not just sixteen numbers. Declare whether it is camera-to-world or world-to-camera, the axis convention, handedness, matrix storage order and units. If an extrinsic is `x_camera = R * x_world + t`, the camera center is `-transpose(R) * t`. A camera center and an extrinsic translation are not interchangeable inputs to registration.

## 26.21 Native recording and live feedback

The capture adapter runs capability detection first: RGB camera, AR tracking, depth support, mesh support, supported resolutions, thermal/battery state, and available storage. It selects an explicit capture profile. A device lacking depth can still record the RGB/VIO profile; a device lacking the required AR capability can contribute a photo-import profile with different quality expectations.

Acquire images and calibration from the same provider frame when possible. Sample keyframes by motion, overlap and quality rather than blindly keeping every rendered frame. Depth/mesh capture can use a different rate, but the association must remain known. Keep UI textures on the GPU where feasible and use bounded asynchronous CPU-image conversion/encoding for persisted keyframes. Avoid a full-resolution per-frame copy through a scripting bridge.

The capture UI reads a local quality buffer: tracking confidence, blur score, pose continuity, revisited features, coverage of selected targets and storage/upload progress. These metrics guide another view, slower motion or a restart. They do not claim to certify the entire district in real time.

On interruption, finalize a segment, write an integrity checkpoint, and resume as a new segment with an explicit relocalization/alignment step. Do not join two tracking origins as if the coordinates remained continuous. Keep raw bundles local until the user chooses upload under the relevant capture policy.

## 26.22 Ingestion and durable reconstruction workflow

The spatial API creates a capture record, issues scoped resumable uploads, verifies object hashes and sizes, validates the manifest, and records completeness. Reject corrupt or inconsistent calibration before allocating expensive processing. Store private evidence separately from published assets.

The processing DAG is: validate and redact, select/calibrate frames, solve local reconstruction, align sessions, perform quality checks, create appearance and localization derivatives, compile candidate play artifacts, wait for review, then publish a manifest. Branch RGB and RGB-D pipelines based on actual capability, not filename extension.

Temporal is the recommended durable orchestration option once this DAG exists [S43]. Each activity receives immutable input references and writes content-addressed outputs plus a structured result. GPU work happens in a worker activity, not in deterministic workflow code. A workflow can wait for review without reserving a GPU. Large frames, meshes and descriptors belong in object storage rather than workflow history.

Deduplicate by input hashes, algorithm/model version and relevant parameters. A retry must not create duplicate publications or charge an unbounded number of GPU jobs. Use deadlines, cancellation, temporary-artifact TTLs, memory budgets and a per-world compute limit. A failure produces a readable diagnostic and preserves valid earlier outputs.

## 26.23 Reconstruction branches

**RGB/SfM branch:** select sharp well-overlapped views, group calibration correctly, build feature correspondences with geometric verification, estimate cameras/structure, and refine a consistent solution. Native poses and GNSS can be priors with uncertainty rather than fixed truth. Dense geometry is a subsequent branch, not a requirement for every sparse localization reference [S31, S32].

**RGB-D branch:** validate depth units, confidence, pose association and registration, reject poor observations, estimate/refine inter-frame or inter-fragment transformations, and fuse accepted measurements. Open3D provides an RGB-D/TSDF integration reference [S33]. Voxel size, truncation distance and integration weights are selected from actual sensor noise and scene scale, not copied from an indoor demo to an entire campus.

**Appearance branch:** generate textured meshes or train an optional splat representation from approved evidence. The output is allowed to improve appearance, never to invent permitted connectivity. If a model fills an unobserved surface, mark that origin in metadata and keep it out of authority derivation.

**Research branch:** evaluate alternate SLAM, learned features, neural reconstruction, or splat methods on fixed datasets with explicit quality and compute metrics. Keep the production compiler interface stable enough to compare methods without rewriting the multiplayer service.

## 26.24 Registration: local scans into one campus frame

Use a world origin with declared WGS84 reference and a local East-North-Up metric frame. Store globally meaningful coordinates in double precision; convert to a local render frame for the client. Record vertical datum assumptions. A phone altitude without a known datum/quality must not become a precise roof or floor elevation.

A monocular SfM result may require a similarity transform, `p_world = s * R * p_scan + t`, to recover scale and alignment. A trustworthy metric visual-inertial/RGB-D result should normally retain metric scale and use rigid alignment, while still checking scale consistency. Validate transformations with control references distributed around the patch, not a single point and a noisy compass bearing.

Use overlap correspondences, robust registration, loop constraints and pose-graph/bundle refinement as appropriate. Reject false matches in repetitive architecture. Keep a georeferencing report containing control residuals, held-out residuals, method, uncertainty and transform version. Geographic registration support exists in COLMAP, but phone GNSS priors do not become survey-grade control merely by passing through that tool [S32].

Angular error is important: a 1-degree yaw error produces roughly 1.75 m lateral error at 100 m from the origin, using the small-angle relationship. That is original geometric arithmetic, not a guaranteed campus measurement. Validate rotations as well as offsets and do not align a ground path only against a roof outline on imagery.

When converting into Unity coordinates, explicitly test ENU axis order, up direction, handedness, quaternion convention, triangle winding and normals. Do not scatter sign flips across shaders and importers. Include a fixture with known east, north and up points and camera poses as part of every exporter/importer test.

## 26.25 Coverage representation and evidence-backed territory

Use separate spatial indexes for observed surfaces, inspected traversable patches, approved access and current restrictions. A practical implementation can use a local metric grid or chunk raster for confidence/observations, polygon geometry for publication and server checks, and a graph for route connectivity. Preserve holes and multipolygons.

Do not expand a walk trace by an arbitrary radius and call every covered pixel scanned. The width of an inspected path patch comes from field evidence or explicit review. Surface coverage can use camera visibility/depth support, view diversity and pose quality, but a visible wall or distant lawn is not automatically traversable coverage.

Each play-polygon component should point to its evidence and review decision. The compiler checks containment in the approved coverage envelope, exclusion subtraction, temporal access, connectivity and minimum operational suitability. Use conservative margins based on measured boundary quality. Treat the participant's live position as an uncertain observation evaluated against this fixed authority, not as a reason to mutate the world boundary.

A possible point near an edge can be `INSIDE`, `OUTSIDE` or `UNCERTAIN`. Fine-grained rewards require sufficient confidence; ordinary physical compliance remains a human rule. Do not apply an automatic capture or punishment based on one uncertain boundary crossing.

## 26.26 Route graph and world semantics

Build nodes from verified junctions, anchors, entrances and objective locations; edges represent approved pedestrian connections with metric length, width/clearance notes, slope/stair flags, open intervals and closure status. The graph is not inferred solely by triangulating the decorative mesh.

Semantic models can propose ground, wall, vegetation or structure labels, followed by geometric checks and human review. A "ground" label does not establish public access. A doorway-looking rectangle does not establish a usable entrance. Store candidate semantics separately from confirmed play affordances.

Use stable IDs across remeshing. Landmarks should survive a new LOD build; an edge can be retired with an explicit replacement/migration record. Graph compiler tests reject self-intersections where unsupported, disconnected objectives, paths through exclusions, impossible vertical connections and directed access mistakes.

For an indoor research branch, introduce explicit levels and vertical connectors, plus the localization method required to establish a level. Do not flatten multiple floors into overlapping 2D nodes and hope GPS altitude resolves it.

## 26.27 Graph-based ability queries

For Graph Sweep, map each eligible player's uncertain pose to plausible graph nodes/edges. Compute bounded shortest-path distance on the published graph, accounting for closures. A conservative disclosure policy can return a confirmed match only when the plausible locations satisfy the preset's criteria; otherwise mark an anonymous uncertain boundary result. The pilot rule is explicit: form bounded plausible origin and target graph locations; compute the minimum and maximum permitted-path distance across those candidates. Confirm in-range only when the maximum is within the budget, confirm out-of-range when the minimum exceeds it, and otherwise return an anonymous uncertain-edge result. An unusable origin fix rejects without spending. The location bounds are operational estimates, not statistical proof of containment.

Use bounded Dijkstra/A* queries over the effective graph for the current world and closure revision. Cache only under those version keys. An unreachable candidate pair must remain unreachable rather than being replaced by straight-line distance. If this conservative policy produces too many uncertain results on actual devices, improve station/anchor localization or revise the mechanic explicitly; do not silently map everyone to a convenient nearest path.

Consider two players 40 m apart through a wall but 160 m apart along approved paths. A 100 m Euclidean Sweep and a 100 m Graph Sweep intentionally differ. That is a clear demonstration of the scanned-world product. The graph is a game-rule representation of permitted connectivity, not a guarantee of the fastest real route or proof of line of sight.

Path Decoy starts at an authorized visited origin and follows a seeded sequence of valid graph edges at a preset game pace. The server publishes only its permitted fake signal trajectory. It never samples arbitrary unverified world coordinates or replays a retained private human route.

A static occlusion-aware ability can use a reviewed proxy BVH and explicitly defined sample heights. Because participant positions and the proxy are uncertain, treat this as a game mechanic with conservative fallback, not a sensor proving whether two humans can physically see each other. Digital jamming modifies a separate signal graph; it cannot close a physical route.

## 26.28 Appearance generation and mobile rendering

Produce a reconstruction master, then derivative LODs and stylized proxies. Preserve landmark silhouettes and authoritative boundary edges independently. Use mesh decimation, texture atlases, normal simplification, material batching and meshoptimizer/gltfpack-style optimization where compatible [S42]. Pin import/export options and verify that coordinate transforms survive the pipeline.

The Unity client loads compiled chunks through an asset adapter. Keep the format independent from one engine's ephemeral editor state: a manifest can reference glTF/GLB-derived content or a Unity build artifact tied to the exact importer/build version. Validate assets before release; do not download and execute arbitrary creator scripts.

Maintain a shader/material vocabulary for ground, architecture, foliage proxy, unknown coverage, closed region, coarse disclosure, station and relay. Make the ground/play mask readable over detailed scans. Hide or fade occluding buildings around critical HUD evidence while preserving the true boundary.

Profile CPU frame time, GPU frame time, memory, thermal behavior, battery, background upload age and alert responsiveness together. Proposed tactical-view targets can start at 30 FPS on the minimum supported device, but derive triangle/texture limits from measurements. Decorative splats can have a separate world-browser quality tier; they must not make the actual chase unusable.

## 26.29 Visual localization and precise anchors

Visual localization estimates a camera pose relative to a reference map; it does not improve a pocketed phone indefinitely after the camera is turned off. For a stopped interaction, capture a small query, retrieve plausible reference images, establish feature correspondences, solve a geometrically verified pose and assess uncertainty/plausibility. hloc is a useful research/tooling reference for this family of pipelines [S38].

A hosted provider may reduce initial work. Niantic VPS2 distinguishes coarse global localization, precise map-relative localization and anchor tracking; the statuses are not interchangeable [S36]. ARCore Geospatial uses provider visual coverage rather than an ECHO-owned scan database [S37]. Check actual site availability, imagery handling, credentials, latency and usage terms before adopting either. Never promise centimeter-level campus gameplay from a marketing accuracy claim.

An ECHO-owned localizer requires curated reference images/features, world-frame consistency, viewpoint/lighting evaluation, false-match testing and operational maintenance. Known reviewed markers or surveyed anchor observations are valuable comparison baselines. A printed code read from a screenshot is not proof of physical presence by itself.

On failed or ambiguous localization, remain in coarse mode and disable only the interaction that needs precision. After the camera closes, uncertainty grows according to the chosen tracking model. No localization result auto-confirms a human catch or grants entry into unmapped territory.

## 26.30 World manifest and atomic publication

A publication is a signed or integrity-verified manifest linking mutually compatible artifacts. The artifact set includes both appearance and authority. Do not update a database polygon first and leave clients displaying a different mesh/legend for an indefinite period.

```yaml
worldId: bits-goa
worldVersion: 12
schemaVersion: 2
status: published
origin:
  geographicFrame: WGS84
  localFrame: ENU
  verticalDatum: explicitly-recorded
chunks:
  - chunkId: courtyard-a
    transformRef: immutable-transform-hash
    evidenceRef: private-capture-manifest-hash
    appearanceRefs:
      - reviewed-lod0-hash
      - reviewed-lod1-hash
    playMaskRef: approved-polygon-hash
    routeGraphRef: reviewed-graph-hash
    landmarksRef: stable-landmarks-hash
    coverageRef: observation-quality-hash
    localizationRef: access-controlled-reference-hash
    qaRef: approved-quality-report-hash
approvalRef: recorded-review-decision
closureBaseline: 0
compatibleProtocol: game-v2
```

A review transaction promotes the complete artifact set and records the content hash. A match stores that world version plus ruleset version and required asset hashes. Loading fails closed if authoritative assets are missing, invalid or incompatible. Missing optional high-detail appearance degrades to approved proxies.

A closure overlay has its own revision, scope, reason category and expiry/review status. It can restrict a pinned world during a visible pause; it cannot expand it. Reopening or adding a route follows the declared publication process. Clients acknowledge the revised effective play mask before resuming if the closure affects their arena.

## 26.31 Spatial database additions

| Entity | Important fields | Access / lifecycle |
| --- | --- | --- |
| worlds / districts | Maintainer, policy, geographic origin, active versions | Public approved metadata; private operations separate |
| capture_sessions | Creator, capabilities, clock domains, permission scope, status | Private evidence workflow |
| capture_objects | Hash, type, size, calibration/association, storage ref | Scoped signed access and retention |
| reconstruction_jobs | Input hashes, worker/model versions, parameters, outputs, failure report | Reproducible job lineage |
| transforms | Source/target frame, SE3/Sim3, covariance/quality, controls | Immutable versioned references |
| coverage_patches | Surface/traversable type, evidence, freshness, confidence | Candidate versus approved status distinct |
| play_regions | Approved polygon/multipolygon, restrictions, review and world version | Server authority; preserve holes |
| route_nodes / edges | Stable IDs, metric geometry, access, dependencies | Versioned topology with closures |
| landmarks / anchors | Stable identity, poses, references, quality | Public identity; sensitive reference assets restricted |
| compiled_artifacts | Content hash, schema, LOD/authority type, importer version | Immutable approved derivatives |
| world_publications | Manifest hash, reviews, approval, superseded version | Atomic release and rollback |
| change_proposals | Old/new evidence, uncertainty, candidate type | Reviewed update workflow |
| closure_overlays | Scope, revision, issuer, reason, acknowledgements | Can restrict active play, never silently expand |

Game membership does not imply access to raw survey evidence or localization indexes. Creator roles do not automatically reveal live participant locations. Separate spatial-publishing credentials from gameplay service credentials and from heavy worker access.

## 26.32 Additional spatial interfaces

The API surface should expose `createCapture`, `uploadEvidence`, `finalizeCapture`, `requestReconstruction`, `getQualityReport`, `proposeCoverage`, `reviewWorld`, `publishWorld`, `getWorldManifest`, `getChunk`, `requestLocalization` and `issueClosure` as separately authorized operations. Names are contracts, not claims of already implemented endpoints.

Publication is not an ordinary client-side write. The server validates the QA and approval references and promotes only matching immutable artifacts. A localization request returns pose, frame/version, quality and expiry information; it does not return the complete private reference database. A chunk request never includes raw player positions.

Keep desktop review and mobile play on the same effective world-version model. The review UI should show evidence, geometry, coverage, access and graph overlays independently so an operator can detect a plausible-looking but invalid map.

## 26.33 Maintenance, change detection and derivative privacy

Register a new scan before comparing it to an old world. Separate changes in appearance, geometry and operation. Compare corresponding supported surfaces with pose uncertainty; use temporal/multi-view confirmation to avoid treating moving people, leaves, shadows or reconstruction noise as a permanent building change.

When a change proposal touches a route edge or station, invalidate dependent objectives for the next publication and require re-review. Preserve old manifests needed for audits within the declared retention policy, but do not keep raw personal evidence indefinitely merely to make rollback convenient.

Redaction must cover source imagery, textures, splats and localization references. Blurring a preview thumbnail does not remove a person's face from a texture atlas or learned appearance model. If sensitive source evidence is removed, identify and rebuild or retire its dependent artifacts. Store dependency lineage so this is implementable.

The game-world refresh is observational, not omniscient. A new crowd or parked obstacle needs a current report/observation; the last scan cannot report its live presence remotely. Closures should have a clear temporary operational path without waiting for a full mesh rebuild.

## 26.34 Spatial QA and release gates

| Gate | Test | Failure behavior |
| --- | --- | --- |
| Sensor integrity | Calibration, timing, units and tracking gaps | Reject or segment evidence before reconstruction |
| Registration | Distributed controls and held-out landmarks | Quarantine chunk; no play publication |
| Coverage truth | Deliberate unknown gaps and visual-only surfaces | Preserve exclusion; no guessed traversability |
| Topology | Connected objectives, barrier and closure fixtures | Reject broken preset/world combination |
| Appearance independence | Remove/degrade visual assets | Approved rule artifacts still load or match refuses start |
| Localization | Wrong-place images, changed light, repeated architecture | Coarse/uncertain fallback, never false precise authority |
| Publication | Missing artifact, wrong hash, incompatible transform | Atomic failure; retain previous version |
| Runtime | Memory/thermal/device matrix under a real round | Lower visual tier or mark unsupported; no hidden stale state |
| Privacy | Faces, private interiors, restricted descriptors in exports | Block publication and rebuild affected derivatives |
| Update | Closure, rescan, rollback and stable-ID migration | Pause or block release; never invent a new route |

Measure relative geometry, geographic alignment, route correctness and localization accuracy separately. If survey-grade reference truth is unavailable, state the weaker evaluation rather than reporting a meaningless centimeter figure. For a first patch, a useful result is a repeatable alignment with held-out errors and a correct permitted route graph; the exact thresholds should reflect the mechanic and arena, not an arbitrary benchmark.

## 26.35 Compute, storage and engineering cost model

Capture and reconstruction change the cost model materially. Separate gameplay hosting, private evidence storage, GPU/CPU processing, compiled-asset delivery, hosted localization calls, device testing and human review.

A hypothetical 20-minute survey at 1.5 retained RGB keyframes per second yields 1,800 images. At an assumed 350 kB each, that is roughly 630 MB before optional depth, metadata and processing artifacts. Sampling 256 x 192 16-bit depth plus an 8-bit confidence image at 0.5 Hz adds about 88 MB uncompressed over the same interval. These are arithmetic planning examples with chosen rates/encodings, not a measured device profile or a prescribed capture configuration.

Dense reconstruction scratch space, intermediate depth, texture atlases and masters can exceed the input size; budget them explicitly and expire temporary artifacts. Do not permanently store every camera frame, every training checkpoint and every published LOD without a retention policy.

Model processing cost as `jobs x measured compute time x actual provider rate`, plus storage and egress. For illustration only, 50 jobs at 0.5 GPU-hours and a hypothetical INR 100/GPU-hour would be INR 2,500 of compute; none of those numbers is a current vendor quote or a runtime guarantee. Benchmark one fixed patch before setting a monthly allowance. Apply per-world budgets and cancel runaway jobs.

At campus scale, mapping, review and maintenance time may dominate cloud compute. A creator-throughput metric should count verified useful area and corrected graph connections per effort, not raw gigabytes. A faster method that repeatedly requires manual repair may be more expensive overall.

## 26.36 Complete toolchain by build phase

| Phase | Tools actually needed | Outputs |
| --- | --- | --- |
| GPS demo | TypeScript, React/Vite, MapLibre GL JS, Fastify, WebSocket/HTTPS, PostgreSQL/PostGIS, test phones | Working multiplayer loop and temporary surveyed permit mask |
| Capture spike | Unity/AR Foundation or direct Swift/Kotlin harness, ARKit/ARCore, calibration/timestamp recorder, optional evaluated scan import | Reproducible RGB/VIO or RGB-D evidence bundle |
| Reconstruction spike | Python, COLMAP/pycolmap, Open3D, controlled CPU/GPU worker image, QGIS | Registered patch, transforms and QA report |
| World compiler | Python geometry/graph tooling, PostGIS, Blender batch/meshoptimizer, schema validators | Approved play artifacts, stylized LODs and manifest |
| Native spatial alpha | Unity/C#/URP, native lifecycle plugins, asset streaming, private protocol client | Playable captured district with graph mechanics |
| Localization research | Known anchors/controls, hloc-style pipeline or evaluated VPS2/Geospatial adapter | Measured map-relative pose capability and fallback rules |
| Maintained campus world | Temporal, versioned blob storage/CDN, contributor/review UI, lineage and redaction jobs | Resumable capture-to-publication and controlled updates |
| Operations and quality | Git/CI, pinned builds/worker containers, rules/spatial/device tests, redacted metrics and traces | Reproducible releases, rollback and supported-device evidence |
| Optional AI authoring | Evaluated vision models/ONNX Runtime, optional OpenAI structured mission drafts, deterministic validators | Reviewable suggestions, never automatic access authority |

The final engineering acceptance is the full chain: **an authorized walk produces evidence; evidence produces a registered, recognizable world chunk; review and compilation produce a play mask with unknown space excluded; the native client loads the same published world as the referee; players complete a real match; and a later rescan can safely update the world without corrupting that match's rules.** That is the system the technology stack exists to build.

