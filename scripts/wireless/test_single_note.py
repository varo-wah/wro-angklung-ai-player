import unittest
from single_note import single_note

REPLIES = {
    "HELLO,1": "READY,1,ACTIVE",
    "STATUS": "STATUS,READY,PROTOCOL=1,MODE=NORMAL,ARMED=FALSE,CONTINUOUS=FALSE,ROUTINE=NONE",
    "ARM": "ACK,ARM", "NOTE,0,300,1000": "ACK,NOTE,0",
    "ALL_OFF": "ACK,ALL_OFF", "DISARM": "ACK,DISARM",
}

class SingleNoteTests(unittest.TestCase):
    def exercise(self, failure=None):
        calls = []
        def fake(host, token, command):
            calls.append(command)
            if command == failure:
                raise RuntimeError("simulated lost reply")
            return REPLIES[command]
        if failure:
            with self.assertRaises(RuntimeError):
                single_note("192.168.1.2", "test", fake, lambda _: None)
        else:
            single_note("192.168.1.2", "test", fake, lambda _: None)
        return calls

    def test_sequence(self):
        self.assertEqual(self.exercise(), list(REPLIES))

    def test_arm_timeout_still_stops_without_note(self):
        self.assertEqual(self.exercise("ARM"), ["HELLO,1", "STATUS", "ARM", "ALL_OFF", "DISARM"])

    def test_note_never_retried(self):
        self.assertEqual(self.exercise("NOTE,0,300,1000"), list(REPLIES))

    def test_disarm_attempted_after_all_off_failure(self):
        self.assertEqual(self.exercise("ALL_OFF")[-1], "DISARM")

    def test_handshake_failure_never_arms(self):
        self.assertEqual(self.exercise("HELLO,1"), ["HELLO,1"])

if __name__ == "__main__":
    unittest.main()
