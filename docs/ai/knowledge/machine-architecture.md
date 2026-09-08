# Machine architecture

Angklobot is a local AI-powered robotic angklung performance system. A visitor can type or speak through the normal chat and mobile voice interfaces. The voice path uses the “Hey Angklobot” wake phrase or a manual microphone button, local Whisper transcription, and text-to-speech. The AI interprets the request, but it does not directly control notes or motors.

The system checks the validated song catalog, loads the selected arrangement from JSON, verifies that its notes fit the G3-C6 rack, and applies timing and motor-safety validation. Only then does the application create an actuator schedule. The simulator and display visualize that schedule; the later physical driver will send the validated commands to motors that trigger the angklung notes.

The governing rule is: the AI suggests, the validator decides, and the robot obeys only a validated schedule.
