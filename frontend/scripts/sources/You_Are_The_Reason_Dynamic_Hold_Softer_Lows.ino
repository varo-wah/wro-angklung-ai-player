/*
  YOU ARE THE REASON - ANGKLOBOT
  Target: Arduino Mega 2560

  Motor system:
    - 18 channels
    - paired IN1 / IN2 pins
    - software PWM at 1 kHz
    - individual motor power percentages
    - note-length-aware motor pulses up to 300 ms
    - non-blocking playback for overlapping notes

  Song:
    - full 827-event arrangement
    - manual start only; no autoplay

  Serial:
    P = play/restart
    S = stop
    T = status
*/

#include <Arduino.h>
#include <avr/pgmspace.h>

constexpr uint8_t CHANNEL_COUNT = 18;
constexpr uint16_t PWM_PERIOD_US = 1000;
constexpr uint16_t MAX_PULSE_DURATION_MS = 300;
constexpr unsigned long SERIAL_BAUD = 115200;

// 0=G3, 1=A3, 2=B3, 3=C4, 4=D4, 5=E4, 6=F4,
// 7=G4, 8=A4, 9=B4, 10=C5, 11=D5, 12=E5,
// 13=F5, 14=G5, 15=A5, 16=B5, 17=C6

const uint8_t IN1_PINS[CHANNEL_COUNT] = {
  6, 8, 2, 4, 28, 26, 32, 30, 12,
  10, 24, 22, 36, 34, 41, 38, 44, 42
};

const uint8_t IN2_PINS[CHANNEL_COUNT] = {
  7, 9, 3, 5, 29, 27, 33, 31, 14,
  11, 25, 23, 37, 35, 42, 39, 45, 43
};

// Per-note power percentages.
uint8_t motorPowerPercent[CHANNEL_COUNT] = {
  50, 40, 40, 40, 40, 40, 40, 40, 40,
  40, 50, 40, 40, 40, 40, 40, 40, 40
};

struct MotorState {
  bool active;
  bool outputHigh;
  uint16_t dutyPermille;
  unsigned long pulseEndMs;
  unsigned long pwmCycleStartUs;
};

MotorState motors[CHANNEL_COUNT];

struct __attribute__((packed)) SongEvent {
  uint32_t startMs;
  uint16_t durationMs;
  uint8_t channel;
};

const SongEvent SONG[] PROGMEM = {
  {0UL, 260, 3},
  {350UL, 148, 0},
  {700UL, 148, 0},
  {1045UL, 148, 3},
  {1395UL, 148, 0},
  {1745UL, 148, 0},
  {2095UL, 148, 3},
  {2440UL, 148, 0},
  {2790UL, 148, 0},
  {3140UL, 148, 3},
  {3490UL, 148, 0},
  {3835UL, 148, 0},
  {4185UL, 260, 1},
  {4185UL, 148, 3},
  {4535UL, 148, 0},
  {4885UL, 148, 0},
  {5235UL, 148, 3},
  {5580UL, 148, 0},
  {5930UL, 148, 0},
  {6280UL, 148, 3},
  {6630UL, 148, 0},
  {6975UL, 148, 0},
  {7325UL, 148, 3},
  {7675UL, 148, 0},
  {8025UL, 148, 0},
  {8370UL, 148, 3},
  {8370UL, 260, 6},
  {8720UL, 148, 0},
  {9070UL, 148, 0},
  {9420UL, 148, 3},
  {9765UL, 148, 0},
  {10115UL, 148, 0},
  {10465UL, 260, 0},
  {10465UL, 148, 2},
  {10815UL, 148, 0},
  {11165UL, 148, 0},
  {11510UL, 148, 2},
  {11860UL, 148, 0},
  {12210UL, 148, 0},
  {12560UL, 260, 3},
  {12905UL, 148, 0},
  {13255UL, 148, 0},
  {13605UL, 148, 3},
  {13955UL, 148, 0},
  {14300UL, 148, 0},
  {14650UL, 148, 3},
  {15000UL, 148, 0},
  {15350UL, 148, 0},
  {15700UL, 148, 3},
  {15700UL, 257, 12},
  {16045UL, 148, 0},
  {16045UL, 257, 11},
  {16395UL, 148, 0},
  {16395UL, 257, 10},
  {16745UL, 260, 3},
  {16745UL, 300, 10},
  {17095UL, 148, 0},
  {17440UL, 148, 0},
  {17790UL, 148, 3},
  {17790UL, 300, 10},
  {18140UL, 148, 0},
  {18490UL, 148, 0},
  {18490UL, 257, 8},
  {18835UL, 148, 3},
  {19185UL, 148, 0},
  {19535UL, 148, 0},
  {19535UL, 257, 7},
  {19885UL, 148, 3},
  {19885UL, 257, 10},
  {20235UL, 148, 0},
  {20235UL, 257, 11},
  {20580UL, 148, 0},
  {20580UL, 257, 12},
  {20930UL, 260, 1},
  {20930UL, 148, 3},
  {20930UL, 300, 10},
  {21280UL, 148, 0},
  {21630UL, 148, 0},
  {21630UL, 300, 8},
  {21975UL, 148, 3},
  {22325UL, 148, 0},
  {22675UL, 148, 0},
  {23025UL, 148, 3},
  {23370UL, 148, 0},
  {23720UL, 148, 0},
  {23720UL, 257, 7},
  {24070UL, 148, 3},
  {24070UL, 257, 10},
  {24420UL, 148, 0},
  {24420UL, 257, 11},
  {24765UL, 148, 0},
  {24765UL, 257, 12},
  {25115UL, 148, 3},
  {25115UL, 260, 6},
  {25115UL, 300, 8},
  {25465UL, 148, 0},
  {25815UL, 148, 0},
  {26165UL, 148, 3},
  {26510UL, 148, 0},
  {26860UL, 148, 0},
  {27210UL, 260, 0},
  {27210UL, 148, 2},
  {27560UL, 148, 0},
  {27905UL, 148, 0},
  {27905UL, 257, 10},
  {28255UL, 148, 2},
  {28255UL, 300, 10},
  {28605UL, 148, 0},
  {28955UL, 148, 0},
  {28955UL, 257, 4},
  {29300UL, 260, 3},
  {29300UL, 300, 5},
  {29650UL, 148, 0},
  {30000UL, 148, 0},
  {30350UL, 148, 3},
  {30700UL, 148, 0},
  {31045UL, 148, 0},
  {31395UL, 148, 3},
  {31745UL, 148, 0},
  {32095UL, 148, 0},
  {32270UL, 128, 10},
  {32440UL, 148, 3},
  {32440UL, 257, 12},
  {32790UL, 148, 0},
  {32790UL, 257, 11},
  {33140UL, 148, 0},
  {33140UL, 257, 10},
  {33490UL, 260, 3},
  {33490UL, 300, 10},
  {33835UL, 148, 0},
  {34185UL, 148, 0},
  {34535UL, 148, 3},
  {34535UL, 300, 10},
  {34885UL, 148, 0},
  {35235UL, 148, 0},
  {35235UL, 257, 8},
  {35580UL, 148, 3},
  {35930UL, 148, 0},
  {36280UL, 148, 0},
  {36280UL, 257, 7},
  {36630UL, 148, 3},
  {36630UL, 257, 10},
  {36975UL, 148, 0},
  {36975UL, 257, 11},
  {37325UL, 148, 0},
  {37325UL, 257, 12},
  {37675UL, 260, 1},
  {37675UL, 148, 3},
  {37675UL, 300, 10},
  {38025UL, 148, 0},
  {38370UL, 148, 0},
  {38370UL, 300, 8},
  {38720UL, 148, 3},
  {39070UL, 148, 0},
  {39420UL, 148, 0},
  {39770UL, 148, 3},
  {40115UL, 148, 0},
  {40465UL, 148, 0},
  {40815UL, 148, 3},
  {40815UL, 257, 10},
  {41165UL, 148, 0},
  {41165UL, 257, 11},
  {41510UL, 148, 0},
  {41510UL, 257, 12},
  {41860UL, 148, 3},
  {41860UL, 260, 6},
  {41860UL, 300, 10},
  {42210UL, 148, 0},
  {42560UL, 148, 0},
  {42560UL, 257, 8},
  {42905UL, 148, 3},
  {43255UL, 148, 0},
  {43605UL, 148, 0},
  {43955UL, 260, 0},
  {43955UL, 148, 2},
  {44300UL, 148, 0},
  {44650UL, 148, 0},
  {44650UL, 257, 10},
  {45000UL, 148, 2},
  {45000UL, 300, 10},
  {45350UL, 148, 0},
  {45700UL, 148, 0},
  {45700UL, 257, 10},
  {46045UL, 260, 1},
  {46045UL, 148, 3},
  {46045UL, 300, 10},
  {46395UL, 148, 0},
  {46745UL, 148, 0},
  {47095UL, 148, 3},
  {47440UL, 148, 0},
  {47790UL, 148, 0},
  {48140UL, 148, 3},
  {48490UL, 148, 0},
  {48835UL, 148, 0},
  {48835UL, 257, 10},
  {49185UL, 148, 3},
  {49185UL, 180, 5},
  {49185UL, 257, 10},
  {49535UL, 148, 0},
  {49535UL, 257, 12},
  {49885UL, 148, 0},
  {49885UL, 257, 14},
  {50235UL, 148, 3},
  {50235UL, 260, 6},
  {50235UL, 300, 15},
  {50580UL, 148, 0},
  {50930UL, 148, 0},
  {51280UL, 148, 3},
  {51280UL, 300, 15},
  {51630UL, 148, 0},
  {51975UL, 148, 0},
  {52325UL, 260, 0},
  {52325UL, 148, 2},
  {52675UL, 148, 0},
  {53025UL, 148, 0},
  {53025UL, 257, 13},
  {53370UL, 148, 2},
  {53370UL, 257, 15},
  {53720UL, 148, 0},
  {53720UL, 257, 14},
  {54070UL, 148, 0},
  {54070UL, 257, 13},
  {54420UL, 260, 1},
  {54420UL, 148, 3},
  {54420UL, 300, 12},
  {54770UL, 148, 0},
  {55115UL, 148, 0},
  {55465UL, 148, 3},
  {55465UL, 128, 12},
  {55640UL, 128, 11},
  {55815UL, 148, 0},
  {55815UL, 300, 10},
  {56165UL, 148, 0},
  {56510UL, 148, 3},
  {56860UL, 148, 0},
  {57210UL, 148, 0},
  {57560UL, 148, 3},
  {57560UL, 180, 5},
  {57560UL, 257, 10},
  {57905UL, 148, 0},
  {57905UL, 257, 12},
  {58255UL, 148, 0},
  {58255UL, 257, 14},
  {58605UL, 148, 3},
  {58605UL, 260, 6},
  {58605UL, 300, 15},
  {58955UL, 148, 0},
  {59300UL, 148, 0},
  {59650UL, 148, 3},
  {59650UL, 300, 15},
  {60000UL, 148, 0},
  {60350UL, 148, 0},
  {60700UL, 260, 0},
  {60700UL, 148, 2},
  {61045UL, 148, 0},
  {61395UL, 148, 0},
  {61395UL, 257, 12},
  {61745UL, 148, 2},
  {61745UL, 257, 15},
  {62095UL, 148, 0},
  {62095UL, 257, 14},
  {62440UL, 148, 0},
  {62440UL, 257, 13},
  {62790UL, 260, 3},
  {62790UL, 300, 12},
  {63140UL, 148, 0},
  {63490UL, 148, 0},
  {63835UL, 148, 3},
  {63835UL, 300, 12},
  {64185UL, 148, 0},
  {64535UL, 148, 0},
  {64885UL, 260, 0},
  {64885UL, 180, 2},
  {64885UL, 300, 11},
  {65930UL, 257, 12},
  {66280UL, 257, 11},
  {66630UL, 257, 10},
  {66975UL, 180, 1},
  {66975UL, 180, 3},
  {66975UL, 300, 10},
  {68025UL, 180, 2},
  {68025UL, 180, 4},
  {68025UL, 300, 11},
  {69070UL, 180, 3},
  {69070UL, 180, 5},
  {69070UL, 300, 12},
  {70115UL, 180, 3},
  {70115UL, 180, 5},
  {70115UL, 300, 17},
  {70815UL, 257, 16},
  {71165UL, 180, 1},
  {71165UL, 260, 3},
  {71165UL, 260, 6},
  {71165UL, 300, 15},
  {73255UL, 180, 0},
  {73955UL, 257, 11},
  {74300UL, 257, 11},
  {74650UL, 257, 11},
  {75000UL, 128, 10},
  {75175UL, 300, 12},
  {75350UL, 260, 3},
  {75700UL, 148, 0},
  {75700UL, 300, 10},
  {76045UL, 148, 3},
  {76395UL, 148, 5},
  {76745UL, 148, 3},
  {77095UL, 148, 0},
  {77440UL, 148, 3},
  {77790UL, 148, 0},
  {78140UL, 148, 3},
  {78490UL, 148, 5},
  {78835UL, 148, 3},
  {79185UL, 148, 0},
  {79535UL, 260, 3},
  {79885UL, 148, 0},
  {80235UL, 148, 3},
  {80580UL, 148, 5},
  {80930UL, 148, 3},
  {81280UL, 148, 0},
  {81630UL, 148, 3},
  {81975UL, 148, 0},
  {82325UL, 148, 3},
  {82675UL, 148, 5},
  {82675UL, 257, 12},
  {83025UL, 148, 3},
  {83025UL, 257, 11},
  {83370UL, 148, 0},
  {83370UL, 257, 10},
  {83720UL, 260, 3},
  {83720UL, 300, 10},
  {84070UL, 148, 0},
  {84420UL, 148, 3},
  {84770UL, 148, 5},
  {84770UL, 300, 10},
  {85115UL, 148, 3},
  {85465UL, 148, 0},
  {85465UL, 257, 8},
  {85815UL, 148, 3},
  {86165UL, 148, 0},
  {86510UL, 148, 3},
  {86510UL, 257, 7},
  {86860UL, 180, 2},
  {86860UL, 148, 5},
  {86860UL, 257, 10},
  {87210UL, 148, 3},
  {87210UL, 257, 11},
  {87560UL, 148, 0},
  {87560UL, 257, 11},
  {87905UL, 260, 1},
  {87905UL, 148, 3},
  {87905UL, 300, 10},
  {88255UL, 148, 0},
  {88605UL, 148, 3},
  {88605UL, 300, 8},
  {88955UL, 148, 5},
  {89305UL, 148, 3},
  {89650UL, 148, 0},
  {90000UL, 148, 3},
  {90350UL, 148, 0},
  {90700UL, 148, 3},
  {91045UL, 180, 5},
  {91045UL, 257, 10},
  {91395UL, 148, 3},
  {91395UL, 257, 11},
  {91745UL, 148, 0},
  {91745UL, 257, 12},
  {92095UL, 148, 3},
  {92095UL, 260, 6},
  {92095UL, 300, 10},
  {92440UL, 148, 0},
  {92790UL, 148, 3},
  {92790UL, 257, 8},
  {93140UL, 148, 5},
  {93490UL, 148, 3},
  {93835UL, 148, 0},
  {94185UL, 260, 0},
  {94185UL, 148, 2},
  {94535UL, 148, 0},
  {94885UL, 148, 2},
  {94885UL, 257, 10},
  {95235UL, 148, 4},
  {95235UL, 300, 10},
  {95580UL, 148, 2},
  {95930UL, 148, 0},
  {95930UL, 257, 4},
  {96280UL, 260, 3},
  {96280UL, 300, 5},
  {96630UL, 148, 0},
  {96975UL, 148, 3},
  {97325UL, 148, 5},
  {97675UL, 148, 3},
  {98025UL, 148, 0},
  {98370UL, 148, 3},
  {98720UL, 148, 0},
  {99070UL, 148, 3},
  {99245UL, 128, 10},
  {99420UL, 148, 5},
  {99420UL, 257, 12},
  {99770UL, 148, 3},
  {99770UL, 257, 11},
  {100115UL, 148, 0},
  {100115UL, 257, 10},
  {100465UL, 260, 3},
  {100465UL, 300, 10},
  {100815UL, 148, 0},
  {101165UL, 148, 3},
  {101510UL, 148, 5},
  {101510UL, 300, 10},
  {101860UL, 148, 3},
  {102210UL, 148, 0},
  {102210UL, 257, 8},
  {102560UL, 148, 3},
  {102560UL, 300, 10},
  {102905UL, 148, 0},
  {103255UL, 148, 3},
  {103430UL, 128, 7},
  {103605UL, 180, 2},
  {103605UL, 148, 5},
  {103605UL, 257, 10},
  {103955UL, 148, 3},
  {103955UL, 257, 12},
  {104305UL, 148, 0},
  {104305UL, 128, 14},
  {104475UL, 300, 15},
  {104650UL, 260, 1},
  {104650UL, 148, 3},
  {105000UL, 148, 0},
  {105350UL, 148, 3},
  {105350UL, 128, 15},
  {105525UL, 300, 11},
  {105700UL, 148, 5},
  {106045UL, 148, 3},
  {106045UL, 257, 11},
  {106395UL, 148, 0},
  {106395UL, 128, 10},
  {106570UL, 300, 12},
  {106745UL, 148, 3},
  {107095UL, 148, 0},
  {107440UL, 148, 3},
  {107440UL, 257, 10},
  {107790UL, 180, 5},
  {107790UL, 257, 10},
  {108140UL, 148, 3},
  {108140UL, 257, 11},
  {108490UL, 148, 0},
  {108490UL, 257, 12},
  {108835UL, 148, 3},
  {108835UL, 260, 6},
  {108835UL, 257, 13},
  {109185UL, 148, 0},
  {109185UL, 257, 13},
  {109535UL, 148, 3},
  {109885UL, 148, 5},
  {109885UL, 257, 15},
  {110235UL, 148, 3},
  {110235UL, 257, 14},
  {110580UL, 148, 0},
  {110580UL, 257, 13},
  {110930UL, 260, 0},
  {110930UL, 148, 2},
  {110930UL, 300, 12},
  {111280UL, 148, 0},
  {111630UL, 148, 2},
  {111975UL, 148, 4},
  {111975UL, 257, 11},
  {112325UL, 148, 2},
  {112325UL, 257, 11},
  {112675UL, 148, 0},
  {112675UL, 300, 12},
  {113025UL, 260, 1},
  {113025UL, 148, 3},
  {113370UL, 148, 0},
  {113370UL, 300, 10},
  {113720UL, 148, 3},
  {114070UL, 148, 5},
  {114420UL, 148, 3},
  {114770UL, 148, 0},
  {115115UL, 148, 3},
  {115465UL, 148, 0},
  {115640UL, 128, 10},
  {115815UL, 148, 3},
  {115815UL, 257, 10},
  {116165UL, 180, 5},
  {116165UL, 257, 10},
  {116510UL, 148, 3},
  {116510UL, 257, 12},
  {116860UL, 148, 0},
  {116860UL, 257, 14},
  {117210UL, 148, 1},
  {117210UL, 260, 6},
  {117210UL, 300, 15},
  {117560UL, 148, 1},
  {117905UL, 148, 1},
  {118255UL, 148, 1},
  {118255UL, 148, 6},
  {118255UL, 300, 15},
  {118605UL, 148, 1},
  {118955UL, 148, 1},
  {119305UL, 260, 0},
  {119305UL, 148, 4},
  {119650UL, 148, 2},
  {120000UL, 148, 2},
  {120000UL, 257, 13},
  {120350UL, 148, 0},
  {120350UL, 148, 4},
  {120350UL, 257, 15},
  {120700UL, 148, 2},
  {120700UL, 257, 14},
  {121045UL, 148, 2},
  {121045UL, 257, 13},
  {121395UL, 260, 1},
  {121395UL, 148, 3},
  {121395UL, 148, 5},
  {121395UL, 300, 12},
  {121745UL, 148, 0},
  {122095UL, 148, 0},
  {122440UL, 148, 3},
  {122440UL, 148, 5},
  {122440UL, 128, 12},
  {122615UL, 128, 11},
  {122790UL, 148, 0},
  {122790UL, 300, 10},
  {123140UL, 148, 0},
  {123490UL, 148, 3},
  {123490UL, 148, 5},
  {123835UL, 148, 0},
  {124185UL, 148, 0},
  {124535UL, 148, 3},
  {124535UL, 180, 5},
  {124535UL, 257, 10},
  {124885UL, 148, 0},
  {124885UL, 257, 12},
  {125235UL, 148, 0},
  {125235UL, 257, 14},
  {125580UL, 148, 1},
  {125580UL, 260, 6},
  {125580UL, 300, 15},
  {125930UL, 148, 1},
  {126280UL, 148, 1},
  {126630UL, 148, 1},
  {126630UL, 148, 6},
  {126630UL, 300, 15},
  {126975UL, 148, 1},
  {127325UL, 148, 1},
  {127675UL, 260, 0},
  {127675UL, 148, 4},
  {128025UL, 148, 2},
  {128370UL, 148, 2},
  {128370UL, 257, 12},
  {128720UL, 148, 0},
  {128720UL, 148, 4},
  {128720UL, 257, 15},
  {129070UL, 148, 2},
  {129070UL, 257, 14},
  {129420UL, 148, 2},
  {129420UL, 257, 13},
  {129770UL, 260, 3},
  {129770UL, 148, 5},
  {129770UL, 300, 12},
  {130115UL, 148, 0},
  {130465UL, 148, 0},
  {130815UL, 148, 3},
  {130815UL, 148, 5},
  {130815UL, 300, 12},
  {131165UL, 148, 0},
  {131510UL, 148, 0},
  {131860UL, 260, 0},
  {131860UL, 180, 2},
  {131860UL, 180, 4},
  {131860UL, 300, 11},
  {132905UL, 257, 12},
  {133255UL, 257, 11},
  {133605UL, 257, 10},
  {133955UL, 180, 1},
  {133955UL, 180, 3},
  {133955UL, 180, 5},
  {133955UL, 300, 10},
  {135000UL, 180, 0},
  {135000UL, 180, 2},
  {135000UL, 180, 4},
  {135000UL, 300, 11},
  {136045UL, 180, 0},
  {136045UL, 180, 3},
  {136045UL, 180, 5},
  {136045UL, 300, 12},
  {137095UL, 180, 0},
  {137095UL, 180, 3},
  {137095UL, 180, 5},
  {137095UL, 300, 17},
  {137790UL, 257, 16},
  {138140UL, 148, 1},
  {138140UL, 260, 3},
  {138140UL, 260, 6},
  {138140UL, 300, 15},
  {138490UL, 148, 3},
  {138840UL, 148, 6},
  {139185UL, 148, 1},
  {139535UL, 148, 6},
  {139885UL, 148, 5},
  {140235UL, 180, 0},
  {140235UL, 260, 3},
  {140235UL, 180, 4},
  {140235UL, 260, 6},
  {140930UL, 257, 14},
  {141280UL, 257, 14},
  {141630UL, 257, 14},
  {141975UL, 128, 12},
  {142150UL, 128, 15},
  {142325UL, 148, 1},
  {142325UL, 260, 6},
  {142675UL, 148, 1},
  {142675UL, 128, 10},
  {142850UL, 128, 10},
  {143025UL, 148, 1},
  {143025UL, 128, 10},
  {143200UL, 128, 10},
  {143370UL, 148, 1},
  {143370UL, 148, 6},
  {143370UL, 257, 10},
  {143720UL, 148, 1},
  {143720UL, 257, 10},
  {144070UL, 148, 1},
  {144070UL, 257, 7},
  {144420UL, 260, 0},
  {144420UL, 148, 2},
  {144770UL, 148, 2},
  {144770UL, 128, 11},
  {144940UL, 128, 11},
  {145115UL, 148, 2},
  {145115UL, 128, 11},
  {145290UL, 128, 11},
  {145465UL, 148, 0},
  {145465UL, 148, 2},
  {145465UL, 257, 11},
  {145815UL, 148, 2},
  {145815UL, 257, 11},
  {146165UL, 148, 2},
  {146165UL, 257, 7},
  {146510UL, 180, 1},
  {146510UL, 148, 3},
  {146510UL, 148, 5},
  {146860UL, 148, 3},
  {146860UL, 128, 11},
  {147035UL, 128, 11},
  {147210UL, 148, 3},
  {147210UL, 128, 11},
  {147385UL, 128, 11},
  {147560UL, 180, 2},
  {147560UL, 148, 4},
  {147560UL, 257, 11},
  {147905UL, 148, 4},
  {147905UL, 257, 11},
  {148255UL, 148, 4},
  {148255UL, 257, 10},
  {148605UL, 180, 3},
  {148605UL, 148, 5},
  {148605UL, 257, 14},
  {148955UL, 148, 5},
  {148955UL, 257, 13},
  {149305UL, 148, 5},
  {149305UL, 257, 12},
  {149650UL, 148, 0},
  {149650UL, 148, 2},
  {149650UL, 180, 5},
  {149650UL, 257, 11},
  {150000UL, 148, 2},
  {150000UL, 257, 12},
  {150350UL, 148, 2},
  {150350UL, 128, 10},
  {150525UL, 128, 8},
  {150700UL, 148, 1},
  {150700UL, 260, 6},
  {151045UL, 148, 1},
  {151045UL, 300, 10},
  {151395UL, 148, 1},
  {151745UL, 148, 1},
  {151745UL, 148, 6},
  {151745UL, 257, 10},
  {152095UL, 148, 1},
  {152095UL, 257, 10},
  {152440UL, 148, 1},
  {152440UL, 257, 7},
  {152790UL, 260, 0},
  {152790UL, 148, 2},
  {153140UL, 148, 2},
  {153140UL, 128, 11},
  {153315UL, 128, 11},
  {153490UL, 148, 2},
  {153490UL, 128, 11},
  {153665UL, 128, 11},
  {153840UL, 148, 0},
  {153840UL, 148, 2},
  {153840UL, 257, 11},
  {154185UL, 148, 2},
  {154185UL, 257, 11},
  {154535UL, 148, 2},
  {154535UL, 257, 7},
  {154885UL, 180, 1},
  {154885UL, 148, 3},
  {154885UL, 148, 5},
  {155235UL, 148, 3},
  {155235UL, 128, 11},
  {155405UL, 128, 11},
  {155580UL, 148, 3},
  {155580UL, 128, 11},
  {155755UL, 128, 11},
  {155930UL, 180, 2},
  {155930UL, 148, 4},
  {155930UL, 257, 11},
  {156280UL, 148, 4},
  {156280UL, 257, 11},
  {156630UL, 148, 4},
  {156630UL, 257, 10},
  {156975UL, 180, 3},
  {156975UL, 148, 5},
  {156975UL, 257, 14},
  {157325UL, 148, 5},
  {157325UL, 257, 13},
  {157675UL, 148, 5},
  {157675UL, 128, 12},
  {157850UL, 300, 11},
  {158025UL, 148, 0},
  {158025UL, 148, 2},
  {158025UL, 180, 5},
  {158370UL, 148, 2},
  {158370UL, 257, 12},
  {158720UL, 148, 2},
  {158720UL, 128, 10},
  {158895UL, 300, 8},
  {159070UL, 180, 1},
  {159070UL, 180, 3},
  {159070UL, 260, 6},
  {161165UL, 260, 0},
  {161165UL, 180, 2},
  {161165UL, 180, 4},
  {161165UL, 300, 9},
  {166045UL, 257, 10},
  {166395UL, 257, 10},
  {166745UL, 257, 12},
  {167095UL, 257, 14},
  {167440UL, 180, 1},
  {167440UL, 180, 6},
  {167440UL, 300, 15},
  {167790UL, 248, 3},
  {168490UL, 180, 1},
  {168490UL, 180, 6},
  {168490UL, 300, 15},
  {169185UL, 148, 0},
  {169535UL, 260, 0},
  {169535UL, 180, 4},
  {170235UL, 257, 13},
  {170580UL, 257, 15},
  {170930UL, 257, 14},
  {171280UL, 257, 13},
  {171630UL, 260, 1},
  {171630UL, 180, 5},
  {171630UL, 300, 12},
  {172675UL, 180, 5},
  {172675UL, 300, 12},
  {173370UL, 148, 5},
  {173720UL, 180, 1},
  {173720UL, 180, 3},
  {174770UL, 180, 0},
  {174770UL, 180, 5},
  {174770UL, 257, 10},
  {175115UL, 257, 12},
  {175465UL, 257, 14},
  {175815UL, 180, 3},
  {175815UL, 180, 6},
  {175815UL, 300, 15},
  {176165UL, 248, 3},
  {176860UL, 180, 1},
  {176860UL, 180, 6},
  {176860UL, 300, 15},
  {177560UL, 148, 0},
  {177905UL, 260, 0},
  {177905UL, 180, 2},
  {177905UL, 180, 4},
  {178605UL, 257, 12},
  {178955UL, 257, 15},
  {179305UL, 257, 14},
  {179650UL, 257, 13},
  {180000UL, 260, 3},
  {180000UL, 180, 5},
  {180000UL, 300, 12},
  {181045UL, 180, 0},
  {181045UL, 180, 5},
  {181045UL, 300, 12},
  {182095UL, 180, 3},
  {182095UL, 180, 5},
  {183140UL, 180, 0},
  {183140UL, 180, 2},
  {183140UL, 180, 4},
  {183840UL, 257, 10},
  {184185UL, 180, 1},
  {184185UL, 180, 3},
  {184185UL, 180, 5},
  {184185UL, 300, 10},
  {185235UL, 180, 0},
  {185235UL, 180, 2},
  {185235UL, 180, 4},
  {185235UL, 300, 11},
  {186280UL, 180, 0},
  {186280UL, 180, 3},
  {186280UL, 180, 5},
  {186280UL, 300, 12},
  {187325UL, 180, 0},
  {187325UL, 180, 3},
  {187325UL, 180, 5},
  {187325UL, 300, 17},
  {188025UL, 257, 16},
  {188375UL, 180, 1},
  {188375UL, 260, 3},
  {188375UL, 260, 6},
  {188375UL, 300, 15},
  {190465UL, 180, 1},
  {190465UL, 180, 4},
  {191165UL, 257, 10},
  {191510UL, 257, 11},
  {191860UL, 257, 11},
  {192210UL, 128, 10},
  {192385UL, 257, 12},
  {192560UL, 180, 0},
  {192560UL, 260, 3},
  {192560UL, 260, 5},
  {192735UL, 128, 11},
  {192905UL, 300, 10},
};

constexpr uint16_t EVENT_COUNT = sizeof(SONG) / sizeof(SONG[0]);
constexpr uint32_t SONG_END_MS = 193600UL;

bool playing = false;
bool completionPrinted = false;
uint16_t nextEventIndex = 0;
unsigned long songStartMs = 0;

bool deadlineReached(unsigned long now, unsigned long deadline) {
  return (long)(now - deadline) >= 0;
}

void writeMotorPinsLow(uint8_t channel) {
  digitalWrite(IN1_PINS[channel], LOW);
  digitalWrite(IN2_PINS[channel], LOW);
}

void stopMotor(uint8_t channel) {
  writeMotorPinsLow(channel);
  motors[channel].active = false;
  motors[channel].outputHigh = false;
  motors[channel].dutyPermille = 0;
}

void allOff() {
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    stopMotor(channel);
  }
}

void startMotorPulse(uint8_t channel, uint16_t requestedDurationMs) {
  if (channel >= CHANNEL_COUNT) return;

  // Preserve the musical duration stored in each song event.
  // Short notes remain short, while 248/257/260/300 ms events are
  // now allowed to sustain instead of being chopped to 180 ms.
  const uint16_t durationMs =
      requestedDurationMs > MAX_PULSE_DURATION_MS
          ? MAX_PULSE_DURATION_MS
          : requestedDurationMs;

  uint16_t dutyPermille =
      (uint16_t)motorPowerPercent[channel] * 10U;

  // The repeated low-register accompaniment is intentionally softer.
  // Only short low notes are reduced, so longer low melody/bass notes
  // can still speak clearly.
  const bool lowRepeatingAccompaniment =
      (channel <= 6 && requestedDurationMs <= 180);

  if (lowRepeatingAccompaniment) {
    dutyPermille = (uint32_t)dutyPermille * 80UL / 100UL;
  }

  writeMotorPinsLow(channel);

  motors[channel].active = dutyPermille > 0;
  motors[channel].outputHigh = false;
  motors[channel].dutyPermille = dutyPermille;
  motors[channel].pulseEndMs = millis() + durationMs;
  motors[channel].pwmCycleStartUs = micros();
}

void updateMotorPulseExpiry() {
  const unsigned long nowMs = millis();

  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    if (motors[channel].active &&
        deadlineReached(nowMs, motors[channel].pulseEndMs)) {
      stopMotor(channel);
    }
  }
}

void updateSoftwarePwm() {
  const unsigned long nowUs = micros();

  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    MotorState &motor = motors[channel];
    if (!motor.active) continue;

    unsigned long phaseUs = nowUs - motor.pwmCycleStartUs;

    if (phaseUs >= PWM_PERIOD_US) {
      motor.pwmCycleStartUs +=
          (phaseUs / PWM_PERIOD_US) * PWM_PERIOD_US;
      phaseUs %= PWM_PERIOD_US;
    }

    const unsigned long onTimeUs =
        (unsigned long)PWM_PERIOD_US *
        motor.dutyPermille / 1000UL;

    const bool shouldBeHigh = phaseUs < onTimeUs;

    if (shouldBeHigh != motor.outputHigh) {
      digitalWrite(IN2_PINS[channel], LOW);
      digitalWrite(IN1_PINS[channel], shouldBeHigh ? HIGH : LOW);
      motor.outputHigh = shouldBeHigh;
    }
  }
}

SongEvent readSongEvent(uint16_t index) {
  SongEvent event;
  memcpy_P(&event, &SONG[index], sizeof(SongEvent));
  return event;
}

void beginPlayback() {
  allOff();
  nextEventIndex = 0;
  songStartMs = millis();
  playing = true;
  completionPrinted = false;

  Serial.print(F("PLAYING YOU ARE THE REASON - EVENTS="));
  Serial.println(EVENT_COUNT);
}

void stopPlayback() {
  playing = false;
  allOff();
  Serial.println(F("STOPPED"));
}

void processSongEvents() {
  if (!playing) return;

  const uint32_t elapsedMs = millis() - songStartMs;

  while (nextEventIndex < EVENT_COUNT) {
    const SongEvent event = readSongEvent(nextEventIndex);

    if ((int32_t)(elapsedMs - event.startMs) < 0) break;

    startMotorPulse(event.channel, event.durationMs);
    nextEventIndex++;
  }

  if (nextEventIndex >= EVENT_COUNT && elapsedMs >= SONG_END_MS) {
    playing = false;
    allOff();

    if (!completionPrinted) {
      completionPrinted = true;
      Serial.println(F("YOU ARE THE REASON COMPLETE"));
    }
  }
}

void processSerial() {
  while (Serial.available() > 0) {
    const char command = Serial.read();

    if (command == 'P' || command == 'p') {
      beginPlayback();
    } else if (command == 'S' || command == 's') {
      stopPlayback();
    } else if (command == 'T' || command == 't') {
      Serial.print(F("PLAYING="));
      Serial.print(playing ? F("TRUE") : F("FALSE"));
      Serial.print(F(", EVENT="));
      Serial.print(nextEventIndex);
      Serial.print('/');
      Serial.println(EVENT_COUNT);
    }
  }
}

void setup() {
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    digitalWrite(IN1_PINS[channel], LOW);
    digitalWrite(IN2_PINS[channel], LOW);

    pinMode(IN1_PINS[channel], OUTPUT);
    pinMode(IN2_PINS[channel], OUTPUT);

    motors[channel].active = false;
    motors[channel].outputHigh = false;
    motors[channel].dutyPermille = 0;
    motors[channel].pulseEndMs = 0;
    motors[channel].pwmCycleStartUs = 0;

    writeMotorPinsLow(channel);
  }

  Serial.begin(SERIAL_BAUD);
  Serial.println(F("ANGKLOBOT - YOU ARE THE REASON"));
  Serial.println(F("Manual start only. Press P to play."));
  Serial.println(F("P=PLAY/RESTART, S=STOP, T=STATUS"));
}

void loop() {
  processSerial();


  processSongEvents();
  updateMotorPulseExpiry();
  updateSoftwarePwm();
}
