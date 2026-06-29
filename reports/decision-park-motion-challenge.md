# Decision: park motion challenge

`shake_antenna_charge` is parked from the admin catalog.

Reason:
- Too sensitive on real phones.
- Browser motion APIs vary.
- Design and game feel are not production-ready.
- Current repo audit recommends stabilizing existing family-native runtimes before adding new families.

Replacement path:
1. Use `logic_circuit` as the next production minigame.
2. Use QR/manual physical flows only after the physical interaction UX is audited.
3. Revisit motion only as an isolated calibration prototype, not in the player production route.
