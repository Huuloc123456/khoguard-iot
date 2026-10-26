"""Small RPi.GPIO-shaped simulator for the Windows/HTML lab."""

from threading import RLock
from time import monotonic


class SimGPIO:
    BCM = "BCM"
    BOARD = "BOARD"
    IN = "IN"
    OUT = "OUT"
    PUD_DOWN = "PUD_DOWN"
    HIGH = 1
    LOW = 0
    RISING = "RISING"
    FALLING = "FALLING"
    BOTH = "BOTH"

    def __init__(self):
        self._lock = RLock()
        self._mode = None
        self._pins = {}
        self._events = {}
        self._pwm = {}

    def setmode(self, mode):
        if mode not in (self.BCM, self.BOARD):
            raise ValueError("Mode must be BCM or BOARD")
        self._mode = mode

    def setup(self, channel, direction, pull_up_down=None, initial=LOW):
        if direction not in (self.IN, self.OUT):
            raise ValueError("Direction must be IN or OUT")
        if direction == self.IN and pull_up_down not in (None, self.PUD_DOWN):
            raise ValueError("Only PUD_DOWN is supported by this simulator")
        with self._lock:
            self._pins[channel] = {
                "direction": direction,
                "value": int(bool(initial)) if direction == self.OUT else self.LOW,
                "pull": pull_up_down,
            }

    def input(self, channel):
        with self._lock:
            return self._pins[channel]["value"]

    def output(self, channel, value):
        with self._lock:
            pin = self._pins[channel]
            if pin["direction"] != self.OUT:
                raise ValueError("Cannot write to an input pin")
            pin["value"] = int(bool(value))

    def PWM(self, channel, frequency):
        if frequency <= 0:
            raise ValueError("PWM frequency must be positive")
        return SimPWM(self, channel, frequency)

    def add_event_detect(self, channel, edge, callback, bouncetime=0):
        if edge not in (self.RISING, self.FALLING, self.BOTH):
            raise ValueError("Edge must be RISING, FALLING or BOTH")
        if bouncetime < 0:
            raise ValueError("bouncetime cannot be negative")
        with self._lock:
            if self._pins[channel]["direction"] != self.IN:
                raise ValueError("Event detection requires an input pin")
            self._events[channel] = {
                "edge": edge,
                "callback": callback,
                "bouncetime": bouncetime / 1000,
                "last_event": float("-inf"),
                "count": 0,
            }

    def simulate_input(self, channel, value):
        callback = None
        at = monotonic()
        with self._lock:
            pin = self._pins[channel]
            if pin["direction"] != self.IN:
                raise ValueError("Only input pins can be simulated")
            old = pin["value"]
            new = int(bool(value))
            pin["value"] = new
            event = self._events.get(channel)
            edge = self.RISING if old == self.LOW and new == self.HIGH else self.FALLING
            if event and old != new and event["edge"] in (edge, self.BOTH):
                if at - event["last_event"] >= event["bouncetime"]:
                    event["last_event"] = at
                    event["count"] += 1
                    callback = event["callback"]
        if callback:
            callback(channel)

    def _set_pwm(self, channel, frequency, duty_cycle, running):
        if not 0 <= duty_cycle <= 100:
            raise ValueError("PWM duty cycle must be between 0 and 100")
        with self._lock:
            self._pwm[channel] = {
                "frequency_hz": frequency,
                "duty_cycle": float(duty_cycle),
                "running": running,
            }

    def snapshot(self):
        with self._lock:
            return {
                "mode": self._mode,
                "pins": {
                    str(number): {"direction": pin["direction"], "value": pin["value"]}
                    for number, pin in self._pins.items()
                },
                "pwm": {str(number): value.copy() for number, value in self._pwm.items()},
                "event_counts": {
                    str(number): event["count"] for number, event in self._events.items()
                },
            }

    def cleanup(self):
        with self._lock:
            self._pins.clear()
            self._events.clear()
            self._pwm.clear()
            self._mode = None


class SimPWM:
    def __init__(self, gpio, channel, frequency):
        self._gpio = gpio
        self._channel = channel
        self._frequency = frequency
        self._duty_cycle = 0
        self._running = False

    def start(self, duty_cycle):
        self._gpio._set_pwm(self._channel, self._frequency, duty_cycle, True)
        self._duty_cycle = duty_cycle
        self._running = True

    def ChangeDutyCycle(self, duty_cycle):
        self._gpio._set_pwm(self._channel, self._frequency, duty_cycle, self._running)
        self._duty_cycle = duty_cycle

    def stop(self):
        self._gpio._set_pwm(self._channel, self._frequency, 0, False)
        self._duty_cycle = 0
        self._running = False


GPIO = SimGPIO()
