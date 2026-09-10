#!/usr/bin/env python3
"""Explicitly invoked Phase 1 test; never retries ARM or NOTE."""
import argparse
import http.client
import ipaddress
import os
import time


def send(host, token, command):
    connection = http.client.HTTPConnection(host, 80, timeout=5)
    try:
        connection.request("POST", "/command", body=command + "\n", headers={
            "Authorization": "Bearer " + token, "Content-Type": "text/plain",
        })
        response = connection.getresponse()
        line = response.read(1024).decode("ascii").strip()
        print(f"{command} -> HTTP {response.status} {line}")
        if response.status != 200 or line.startswith("ERROR,"):
            raise RuntimeError(line)
        return line
    finally:
        connection.close()


def single_note(host, token, sender=send, sleep=time.sleep):
    expected = [
        ("HELLO,1", "READY,1,ACTIVE"),
        ("STATUS", "STATUS,READY,PROTOCOL=1,MODE=NORMAL,ARMED=FALSE,CONTINUOUS=FALSE,ROUTINE=NONE"),
        ("ARM", "ACK,ARM"),
        ("NOTE,0,300,1000", "ACK,NOTE,0"),
    ]
    arm_attempted = False
    try:
        for command, acknowledgment in expected:
            if command == "ARM":
                arm_attempted = True
            actual = sender(host, token, command)
            if actual != acknowledgment:
                raise RuntimeError(f"Expected {acknowledgment!r}, received {actual!r}; aborting")
        sleep(0.35)
    finally:
        if arm_attempted:
            # Attempt both independently, even after lost/ambiguous ARM/NOTE replies.
            errors = []
            for command, acknowledgment in [("ALL_OFF", "ACK,ALL_OFF"), ("DISARM", "ACK,DISARM")]:
                try:
                    actual = sender(host, token, command)
                    if actual != acknowledgment:
                        raise RuntimeError(f"Unexpected {command} reply: {actual}")
                except Exception as error:
                    errors.append(str(error))
            if errors:
                raise RuntimeError("Cleanup unconfirmed; remove motor power. " + "; ".join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="ESP32 private LAN IPv4 address")
    parser.add_argument("--stage", required=True, choices=["power-disconnected", "powered"],
                        help="Explicit operator declaration; script cannot sense motor power")
    args = parser.parse_args()
    address = ipaddress.IPv4Address(args.host)
    networks = [ipaddress.IPv4Network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
    if not any(address in network for network in networks):
        parser.error("Use an RFC1918 private LAN IPv4 address")
    token = os.environ.get("ANGKLOBOT_BRIDGE_TOKEN", "")
    if len(token) < 32:
        parser.error("Set ANGKLOBOT_BRIDGE_TOKEN (at least 32 characters)")
    print(f"Operator-declared stage: {args.stage}. Sending channel 0 / 300 ms / strength 1000.")
    single_note(args.host, token)


if __name__ == "__main__":
    main()
