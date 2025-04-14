<template>
    <div>
        <!-- Loading message -->
        <div v-if="loading" id="loading-container">
            <p>Loading the exam, please wait...</p>
            <p>Don't fret, your time won't start until we load the exam</p>
        </div>

        <!-- Exam container (hidden until iframe is ready) -->
        <div id="exam-container">
            <h3 class="timer">Time Remaining: <span id="timer"></span></h3>
            <iframe id="examFrame"></iframe>
        </div>
    </div>
</template>
  
<style scoped>
body,
html {
    margin: 0;
    padding: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-family: Arial, sans-serif;
}

#exam-container {
    width: 100vw;
    height: 100vh;
    display: none;
    flex-direction: column;
}

.timer {
    text-align: center;
}

iframe {
    width: 100%;
    height: 100%;
    border: none;
    flex-grow: 1;
}

#loading-container {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: bold;
    color: #444;
}
</style>
  
<script>
import axios from 'axios';
const serverUrl = `http://localhost:3000`;

export default {
    name: 'ExamView',
    data() {
        return {
            loading: true, // Show loading until iframe is ready.
            email: null,
            monitoringActive: false,
            userWarned: false,
            lastActiveTime: Date.now(),
            tabId: Date.now().toString(),
            checkInterval: null,
            focusCheckInterval: null,
            broadcastChannel: null,
            statusMessage: 'Quiz monitoring is not active.',
            violations: 0, // Track number of violations
            violationDetails: {
                tabSwitches: 0,
                focusLoss: 0,
                newTabs: 0
            }
        };
    },
    async mounted() {
        // seems when the time is 0, it doesn't refresh
        await this.verifyToken(); // verify that token is present and return email. wrap this in a if token is available.
        const formId = this.$route.params.id;
        await this.$store.dispatch('initAccessToken');
        try {
            const res = await axios.get(`${serverUrl}/validate-link`);
            const proctoredData = res.data.data;
            const isFound = proctoredData.find(quiz => quiz.form === formId);
            const isAvailable = this.isTimeFrame(isFound.start, isFound.end);
            if (!isFound || !isAvailable) {
                this.$router.push({ name: 'NotFound' })
            } else {
                // store form name
                this.name = isFound.name
                try {
                    const response = await axios.post(`${serverUrl}/check-status`, {
                        email: this.email,
                        sheet: this.name,
                    });
                    if (response.data.status == 'Progress') {
                        // get start and endtime and ensure it is within timeframe.
                        // load form and corresponding time.
                        const formLink = `https://docs.google.com/forms/d/${formId}/viewform`;
                        const iframe = document.getElementById("examFrame");

                        // Save form link
                        localStorage.setItem("examLink", formLink);
                        iframe.src = formLink;

                        // set Timer
                        localStorage.setItem("currentTime", isFound.time)

                        Swal.fire({
                            title: 'Important: Close All Other Tabs',
                            html: `
                                <div style="text-align: left">
                                    <p><strong>You may have multiple tabs or windows open.</strong></p>
                                    <p>We won't penalize you if you have multiple tabs and windows open before the exam, 
                                        but we will, once you leave to another tab. Please close ALL other browser tabs and windows before continuing.</p>
                                    <p>Steps to prepare:</p>
                                    <ol>
                                        <li>Close all other browser tabs and windows.</li>
                                        <li>Disable any background applications that might open popups</li>
                                        <li>Turn off notifications that might distract you</li>
                                        <li>After closing all tabs, click "Continue"</li>
                                    </ol>
                                </div>
                            `,
                            icon: 'warning',
                            showCancelButton: false,
                            confirmButtonText: 'Continue',
                            allowOutsideClick: false
                        }).then((result) => {
                            if (result.isConfirmed) {
                                this.startMonitoring();
                            } else {
                                // Give them another chance after delay
                                setTimeout(() => this.showInitialSetupModal(), 3000);
                            }
                        });

                        // When the form finishes loading
                        iframe.onload = () => {
                            this.loading = false;
                            document.getElementById("exam-container").style.display = "flex";

                            // Set start time if not already set
                            if (!localStorage.getItem("examStartTime")) {
                                localStorage.setItem("examStartTime", Date.now());
                            }
                            this.startTimer();
                        };
                    } else {
                        Swal.fire("Test Unavailable!", `You have taken this test already`, "info");
                        return null;
                    }
                } catch (error) {
                    console.error('Error checking status:', error);
                    return null;
                }
            }
        } catch (err) {
            Swal.fire("Error!", `An error occurred, could be your network connection: ${err}`, "error");
        };

    },
    methods: {
        isTimeFrame(startDateTime, endDateTime) {
            const now = new Date();

            // If both start and end times are provided
            if (startDateTime && endDateTime) {
                return now >= new Date(startDateTime) && now <= new Date(endDateTime);
            }

            // If only start time is provided
            if (startDateTime && !endDateTime) {
                return now >= new Date(startDateTime);
            }

            // If only end time is provided
            if (!startDateTime && endDateTime) {
                return now <= new Date(endDateTime);
            }

            // If neither is provided, allow access by default
            return true;
        },
        async verifyToken() {
            let token = this.$route.query.token;
            // get token from route and verify it. if valid, give them access to the exam.
            // log the user into google sheet after veification
            // the token should expire in 2 hours.
            // our stack is one big dynamo, therefore, users shouldn't be able to generate a new link if there email 
            // alraedy appears in Googlesheet. Infact, we can ensure a prepaid email list for all our candidates, to ensure
            // they can't provide double emails, especially if those emails don't appear in the email list.
            // the submitting should return the user's email.
            try {
                const res = await axios.post(`${serverUrl}/verify-token`, { token });
                if (res.data.valid) {
                    // store email in this.email, showing email is valid
                    this.email = res.data.email;
                    // else send swal that they've already taken the test
                } else {
                    Swal.fire("Error!", `We can't log you in, you seem to be using an expired link`, "error");
                    return null;
                }
            } catch (err) {
                Swal.fire("Error!", `An error occurred, could be your network connection: ${err}`, "error");
            }
        },
        async updateSheet(name, email) {
            try {
                await axios.post(`${serverUrl}/update-sheet`, {
                    sheet: name,
                    email: email,
                    violations: this.violations
                });
            } catch (err) {
                Swal.fire("Error!", `An error occurred, could be your network connection: ${err}`, "error");
            }
        },
        startTimer() {
            const startTime = parseInt(localStorage.getItem("examStartTime"));
            const duration = parseInt(localStorage.getItem("currentTime")) || 5; // Default 5 minutes

            const examEndTime = startTime + duration * 60 * 1000;

            const interval = setInterval(() => {
                const currentTime = Date.now();
                const remainingTime = Math.max(0, Math.floor((examEndTime - currentTime) / 1000));

                const minutes = Math.floor(remainingTime / 60);
                const seconds = remainingTime % 60;
                document.getElementById("timer").textContent = `${minutes}m ${seconds}s`;

                if (remainingTime <= 0) {
                    clearInterval(interval);
                    // push this to exam done, let user know their response have been recorded.
                    // alert("Time is up! Submitting the exam now.");

                    // send the email, fullname, and testinfo to googlesheet.
                    // I propose the user's fullname and email are saved to their localstorage in the mounted guard for exam.
                    // possibly pass it as a simple jwt token, no need to add secret and verifying in backend.
                    localStorage.removeItem("currentTime");
                    localStorage.removeItem("examStartTime");
                    localStorage.removeItem("examLink");
                    try {
                        this.updateSheet(this.name, this.email)
                    } catch (err) {
                        Swal.fire("Error!", `An error occurred, could be your network connection: ${err}`, "error");
                    }
                    this.$router.push('/success')
                }
            }, 1000);
        },
        // Show initial setup modal
        showInitialSetupModal() {
            Swal.fire({
                title: 'Important: Close All Other Tabs',
                html: `
                    <div style="text-align: left">
                        <p><strong>You currently have multiple tabs or windows open.</strong></p>
                        <p>Please close ALL other browser tabs and windows before continuing.</p>
                        <p>Steps to prepare:</p>
                        <ol>
                            <li>Close all other browser tabs and windows</li>
                            <li>Disable any background applications that might open popups</li>
                            <li>Turn off notifications that might distract you</li>
                            <li>After closing all tabs, click "Check Again"</li>
                        </ol>
                    </div>
                `,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Check Again',
                cancelButtonText: 'I need more time',
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    this.startMonitoring();
                } else {
                    // Give them another chance after delay
                    setTimeout(() => this.showInitialSetupModal(), 3000);
                }
            });
        },

        // Start the monitoring system
        startMonitoring() {
            // Set flag that monitoring is active
            this.monitoringActive = true;
            this.statusMessage = 'Quiz monitoring is active - do not open other tabs';

            // Create a broadcast channel for tab communication
            this.broadcastChannel = new BroadcastChannel('quiz_security_channel');

            // Set up broadcast channel listeners
            this.setupBroadcastListener();

            // Start regular broadcasts
            this.startBroadcasting();

            // Add visibility change listener
            this.setupVisibilityListener();

            // Set up focus checks
            this.setupFocusChecks();

            // Set up activity monitoring
            this.setupActivityMonitoring();

            // Setup periodic activity check
            this.checkInterval = setInterval(this.checkUserActivity, 5000);

            // Block context menu
            this.blockContextMenu();

            // Warn on page exit
            this.setupBeforeUnloadWarning();

            // Show confirmation alert
            Swal.fire({
                title: 'Monitoring Active',
                text: 'Tab monitoring is now active. Please do not open new tabs or windows during your quiz.',
                icon: 'success',
                timer: 3000,
                timerProgressBar: true,
                showConfirmButton: false
            });
        },

        // Set up the broadcast channel listener
        setupBroadcastListener() {
            this.broadcastChannel.onmessage = (event) => {
                if (event.data.type === 'presence' && event.data.id !== this.tabId) {
                    // Another tab was opened
                    this.logViolation('opened a new browser tab');
                }
            };
        },

        // Start broadcasting presence on the channel
        startBroadcasting() {
            // Broadcast initial presence
            this.broadcastPresence();

            // Set up interval for regular broadcasts
            setInterval(() => this.broadcastPresence(), 1000);
        },

        // Broadcast this tab's presence
        broadcastPresence() {
            if (this.broadcastChannel && this.monitoringActive) {
                this.broadcastChannel.postMessage({
                    type: 'presence',
                    id: this.tabId,
                    timestamp: Date.now()
                });
            }
        },

        // Set up visibility change listener
        setupVisibilityListener() {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.logViolation('switched to another tab or window');
                } else {
                    this.updateUserActivity();
                }
            });
        },

        // Set up focus checks
        setupFocusChecks() {
            this.focusCheckInterval = setInterval(() => {
                if (!document.hasFocus() && this.monitoringActive) {
                    this.logViolation('lost focus on this tab');
                }
            }, 2000);
        },

        // Set up activity monitoring
        setupActivityMonitoring() {
            document.addEventListener('mousemove', this.updateUserActivity);
            document.addEventListener('keydown', this.updateUserActivity);
            document.addEventListener('click', this.updateUserActivity);
        },

        // Block context menu
        blockContextMenu() {
            document.addEventListener('contextmenu', (e) => e.preventDefault());
        },

        // Set up beforeunload warning
        setupBeforeUnloadWarning() {
            window.addEventListener('beforeunload', (e) => {
                if (this.monitoringActive) {
                    e.preventDefault();
                    e.returnValue = '';
                    return '';
                }
            });
        },

        // Check if user has been inactive
        checkUserActivity() {
            if (!this.monitoringActive) return;

            const inactiveTime = Date.now() - this.lastActiveTime;
            // If inactive for more than 30 seconds
            if (inactiveTime > 30000 && !this.userWarned) {
                this.userWarned = true;
                Swal.fire({
                    title: 'Are you still there?',
                    text: 'We detected no activity. Please continue with your quiz.',
                    icon: 'question',
                    confirmButtonText: 'I\'m here',
                    allowOutsideClick: false
                }).then(() => {
                    this.userWarned = false;
                    this.updateUserActivity();
                });
            }
        },

        // Update last active time
        updateUserActivity() {
            this.lastActiveTime = Date.now();
        },

        // Log violations and alert user
        logViolation(violationType) {
            if (!this.monitoringActive || this.userWarned) return;

            // Increment the violations counter
            this.violations++;

            // Track specific violation types
            if (violationType.includes('switched to another tab')) {
                this.violationDetails.tabSwitches++;
            } else if (violationType.includes('lost focus')) {
                this.violationDetails.focusLoss++;
            } else if (violationType.includes('opened a new browser tab')) {
                this.violationDetails.newTabs++;
            }

            // Alert the user
            this.userWarned = true;
            Swal.fire({
                title: 'Warning: Suspicious Activity',
                html: `
                    <div style="text-align: left">
                        <p>We detected that you ${violationType}.</p>
                        <p>This activity has been logged and reported.</p>
                        <p><strong>Violation #${this.violations}</strong></p>
                        <p>Please remain on this tab for the duration of your quiz.</p>
                    </div>
                `,
                icon: 'warning',
                confirmButtonText: 'I understand',
                allowOutsideClick: false
            }).then(() => {
                this.userWarned = false;
                this.updateUserActivity();
            });
        }
    },
    // Clean up when component is destroyed
    beforeDestroy() {
        // Clear all intervals
        if (this.checkInterval) clearInterval(this.checkInterval);
        if (this.focusCheckInterval) clearInterval(this.focusCheckInterval);

        // Close broadcast channel
        if (this.broadcastChannel) this.broadcastChannel.close();

        // Remove event listeners
        document.removeEventListener('mousemove', this.updateUserActivity);
        document.removeEventListener('keydown', this.updateUserActivity);
        document.removeEventListener('click', this.updateUserActivity);
    }
};
</script>
  