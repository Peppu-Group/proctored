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
            email: null
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
                    console.log(response.data.status)
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
                        console.warn(response.data.message);
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
                console.log(res)
                if (res.data.valid) {
                    this.email = res.data.email;
                    // search google sheet for user email, if not present,log the user into googlesheet

                    // else send swal that they've already taken the test
                } else {
                    // send swal that they're using an expired link and exam can't be found. 
                }
            } catch (err) {
                console.log(err)
            }
        },
        async updateSheet(name, email) {
            try {
                await axios.post(`${serverUrl}/update-sheet`, {
                    sheet: name,
                    email: email
                });
            } catch (err) {
                console.log('err occurred')
            }
        },
        startTimer() {
            const startTime = parseInt(localStorage.getItem("examStartTime"));
            const duration = parseInt(localStorage.getItem("currentTime")) || 5; // Default 5 minutes
            console.log(duration)

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

                    try {
                        const form = document.querySelector("iframe").contentWindow.document.querySelector("form");
                        if (form) form.submit();
                    } catch (e) {
                        console.warn("Form submit failed (possibly due to cross-origin policy):", e);
                    }

                    // send the email, fullname, and testinfo to googlesheet.
                    // I propose the user's fullname and email are saved to their localstorage in the mounted guard for exam.
                    // possibly pass it as a simple jwt token, no need to add secret and verifying in backend.
                    localStorage.removeItem("currentTime");
                    localStorage.removeItem("examStartTime");
                    localStorage.removeItem("examLink");
                    try {
                        this.updateSheet(this.name, this.email)
                    } catch (err) {
                        console.log(err)
                    }
                    this.$router.push('/success')
                }
            }, 1000);
        }
    }
};
</script>
  