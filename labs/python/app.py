"""Local-only Flask page for the Raspberry Pi GPIO lesson, using fake pins."""

import atexit

from flask import Flask, abort, jsonify, redirect, render_template, request, url_for

from gpio_sim import GPIO

LED_PINS = {"red": 13, "yellow": 19, "green": 26}
BUTTON_PIN = 17
PWM_PIN = 18

def toggle_red_on_press(_channel):
    GPIO.output(LED_PINS["red"], not GPIO.input(LED_PINS["red"]))


def configure_gpio():
    global pwm
    GPIO.cleanup()
    GPIO.setmode(GPIO.BCM)
    for pin in (*LED_PINS.values(), PWM_PIN):
        GPIO.setup(pin, GPIO.OUT)
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
    GPIO.add_event_detect(BUTTON_PIN, GPIO.RISING, toggle_red_on_press, bouncetime=600)
    pwm = GPIO.PWM(PWM_PIN, 100)
    pwm.start(30)


configure_gpio()
atexit.register(GPIO.cleanup)

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html", leds=LED_PINS, state=GPIO.snapshot())


@app.route("/led/<color>/<action>", methods=["POST"])
def control_led(color, action):
    if color not in LED_PINS or action not in ("on", "off"):
        abort(404)
    GPIO.output(LED_PINS[color], GPIO.HIGH if action == "on" else GPIO.LOW)
    return redirect(url_for("index"))


@app.post("/pwm")
def set_pwm():
    try:
        duty_cycle = int(request.form["duty_cycle"])
    except (KeyError, ValueError):
        abort(400)
    if not 0 <= duty_cycle <= 100:
        abort(400)
    pwm.ChangeDutyCycle(duty_cycle)
    return redirect(url_for("index"))


@app.post("/button/press")
def press_button():
    GPIO.simulate_input(BUTTON_PIN, GPIO.HIGH)
    GPIO.simulate_input(BUTTON_PIN, GPIO.LOW)
    return redirect(url_for("index"))


@app.get("/api/state")
def state():
    return jsonify(GPIO.snapshot())


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5002, debug=False, use_reloader=False)
