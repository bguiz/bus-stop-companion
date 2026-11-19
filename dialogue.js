// Dialogue templates, keyed by archetype then situation. Static by design (see PRD F5).
// Situation priority is decided in lib.js (situationKey).
export const ARCHETYPES = ['cheerful', 'stoic', 'tsundere', 'dramatic'];

export const DIALOGUE = {
  cheerful: {
    arriving: ['It is here! Hop on, hop on!', 'Right on time, let us go!'],
    packed: ['Squishy ride ahead, but we are in this together!', 'Packed! Great chance to make a new friend.'],
    storm: ['Thunder! Stay under the shelter, okay?', 'Big storm! I will guard your spot at the stop.'],
    rain: ['Rain! Perfect excuse for a bus ride!', 'Splashy weather, hold your umbrella high!'],
    hazy: ['A bit hazy out there, but our bus is on the way!', 'Hazy skies, bright mood!'],
    standing: ['Standing room only, but the view is fine!', 'You may have to stand, we can do it!'],
    noGps: ['I cannot see this one yet, but it is out there!', 'No signal on this bus, so it is a surprise!'],
    soon: ['Almost here, get ready!', 'A few more minutes, you got this!'],
    long: ['A long wait, so let us find something fun to look at.', 'Good time to stretch and people-watch!'],
    wait: ['On its way, nice and steady!', 'Just a little while longer!'],
  },
  stoic: {
    arriving: ['It has arrived. Board.', 'The bus is here. Proceed.'],
    packed: ['Crowded. Endure it.', 'No space. Stand firm.'],
    storm: ['Thunder. Stay under cover.', 'Dangerous weather. Wait inside the shelter.'],
    rain: ['Rain. Keep your umbrella close.', 'Wet weather. Nothing to do but wait.'],
    hazy: ['Haze. Breathe carefully.', 'Poor air. The bus will still come.'],
    standing: ['Standing room. Hold the rail.', 'You will stand. It is fine.'],
    noGps: ['Position unknown. It may still come.', 'No signal. Trust the schedule.'],
    soon: ['Soon. Be ready.', 'Minutes away. Prepare.'],
    long: ['A long wait. Patience.', 'Time passes. So does the bus.'],
    wait: ['It comes. Wait.', 'Not yet.'],
  },
  tsundere: {
    arriving: ['Finally! Do not just stand there, get on!', 'It is here, so hurry up. Not that I was waiting for you.'],
    packed: ['It is packed. Not my fault, so do not look at me!', 'Ugh, so crowded. Do not squash me.'],
    storm: ['Thunder?! I am not scared, I just do not like it!', 'This storm is annoying. Stay close, I mean, stay under the shelter!'],
    rain: ['It is raining. I brought an umbrella, but not for you.', 'Rain again. Do not complain to me.'],
    hazy: ['The haze is awful. I am not worried about you, okay?', 'Hazy again. Wear a mask or something.'],
    standing: ['You will have to stand. Do not whine about it.', 'No seats. Deal with it.'],
    noGps: ['I cannot track this one. It is not like I care.', 'No signal, so do not ask me where it is.'],
    soon: ['It is nearly here. Do not make me say it twice.', 'A few minutes. Be ready, silly.'],
    long: ['This is taking forever. Not that I mind waiting with you.', 'A long wait. Do not blame me.'],
    wait: ['It will come when it comes.', 'Stop staring at the road, it will not come faster.'],
  },
  dramatic: {
    arriving: ['Behold! The chariot of destiny arrives!', 'It has come! Our moment is now!'],
    packed: ['A sea of people! Brace for the battle!', 'The bus is full. Fate tests us today!'],
    storm: ['The heavens roar! This is no ordinary ride!', 'Lightning splits the sky! We shall not yield!'],
    rain: ['The skies weep for our journey!', 'Rain falls like a curtain on our grand scene!'],
    hazy: ['A veil of mist covers the city! Mystery awaits!', 'The haze hides all, but our bus shall pierce it!'],
    standing: ['No seats! A true trial of balance!', 'We stand, as heroes stand!'],
    noGps: ['This bus hides from our sight! A phantom!', 'Its position is unknown! The plot thickens!'],
    soon: ['The moment draws near!', 'Soon, the story continues!'],
    long: ['The wait stretches like an epic saga!', 'Time crawls, yet we endure!'],
    wait: ['Patience, for the road holds its secrets!', 'It approaches, though the hour is slow!'],
  },
};
