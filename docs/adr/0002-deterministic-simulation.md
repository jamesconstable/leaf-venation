# The simulation is fully deterministic from (settings, random seed, model version)

Shared URLs must reproduce the exact leaf, not merely a similar one, so all randomness in the simulation comes from a PRNG initialised with the random seed, and tie-breaks and iteration orders are deterministic. `Math.random` is never used in simulation code. Each URL records a model version: any change that alters the output for the same settings and seed must bump it, so old links can be recognised (and, ideally, still reproduced) rather than silently drawing a different leaf.
