# 08: Simulator with simulated staff and a shift rhythm

**What to build:** A command starts the simulator, and within a couple of minutes the dashboard feed is moving: named simulated nurses across the six facilities record vitals, mark medications given, write progress notes, report incidents, update resident details, and schedule appointments. Actions follow a daily shift rhythm and never violate clinical plausibility. Stopping the command stops the activity.

**Blocked by:** 07 (Dashboard tiles and the live activity feed)

**Status:** ready-for-agent

- [ ] Ten simulated staff exist in the seed, spread across facilities and units, and are flagged as simulated
- [ ] A standalone command-line process shares the domain and generator modules with the seeder, writes through the service role with the acting simulated nurse set as actor, and produces audit events that look identical to real ones
- [ ] A shift rhythm weights action types by time of day (intake and vitals in the morning, lab draws and administrations midday, notes and discharges in the afternoon, quiet overnight)
- [ ] A pace option scales the interval between actions; the default is one action every 30 to 90 seconds
- [ ] Plausibility rules hold: no administration of a discontinued order, no activity for former residents, vitals within plausible bounds for the resident, incidents at a realistic low rate, and simulated nurses only act within their own units
- [ ] Unit tests with a fake clock and an in-memory store cover action selection by time of day and every plausibility rule
- [ ] Running the simulator against the seeded database for two minutes at fast pace produces visible feed activity and no rejected writes
