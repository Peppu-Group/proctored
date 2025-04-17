<template>
    <div class="d-flex vh-100">
        <!-- Sidebar on the left -->
        <div class="sidebar ">
            <SideBar />
        </div>

        <!-- Centered Quiz Container -->
        <div class="d-flex flex-grow-1 justify-content-center align-items-center bg-light">
            <div class="quiz-container p-4">
                <h2 class="fw-bold">Your quiz link is ready</h2>
                <p class="text-secondary">
                    <i class="bi bi-unlock"></i> Public access &nbsp;
                    <i class="bi bi-eye-slash"></i> Proctoring off &nbsp;
                    <a class="text-decoration-none">Change settings from the sidebar</a>
                </p>
                <div class="input-group my-3">
                    <input type="text" class="form-control text-center"
                        :value="generateQuizLink(currentQuiz?.form || '', currentQuiz?.name || '', currentQuiz?.time || '')" readonly>
                    <button class="btn btn-primary"
                        @click="copyLink(currentQuiz?.form || '', currentQuiz?.name || '')">Copy</button>
                    <a :href="generateQuizLink(currentQuiz?.form || '', currentQuiz?.name || '', currentQuiz?.time || '')"><i
                            class="bi bi-box-arrow-up-right bicon"></i></a>
                </div>
                <p class="text-muted">
                    You have <strong>{{ 5 - quizLength }} free tests</strong> left.
                    <a href="#" class="fw-bold">Upgrade now.</a>
                </p>
            </div>
        </div>
    </div>
</template>

<script>
import SideBar from '../components/SideBar.vue';
import axios from 'axios';
const serverUrl = `https://proctored.server.peppubuild.com`;
const frontUrl = `https://proctored.peppubuild.com`;

export default {
    name: 'FormLink',
    components: { SideBar },
    computed: {
        currentQuiz() {
            return this.$store.state.currentQuiz; // Access current quiz from Vuex
        },
        quizLength() {
            return this.$store.getters.quizLength;
        }
    },


    mounted() {
        if (this.$route.query.token) {
            this.verifyToken(this.$route.query.token);
        } else if (this.$route.query.id) {
            this.getQuizDetailsByFormId(this.$route.query.id)
            // search localhost to ensure id is present. if present, set formLink and local storage. else throw error on manipulated form.
            // say something like we don't have permissions to set timer for this form.
            // localStorage.setItem('currentTime', this.$route.query.time);
            // localStorage.setItem('currentLink', this.$route.query.id);
        } else {
            Swal.fire("Error!", "We don't have permissions to set timer, no form provided", "error");
            this.clearQuizData();
        }

    },

    methods: {
        copyLink(id, name, time) {
            let formLink = this.generateQuizLink(id, name, time);
            navigator.clipboard.writeText(`${formLink}`);
            Swal.fire("Success!", "Quiz link copied!", "success");
        },
        generateQuizLink(id, name, time) {
            if (id && name) {
                let email = localStorage.getItem('email');
                return id ? `${frontUrl}/getmail/${id}?name=${name}&email=${email}&time=${time}` : ''; // Returns URL if ID exists, else empty string
            } else {
                return '';
            }
        },
        async verifyToken(token) {
            try {
                const res = await axios.post('https://proctored.server.peppubuild.com/verify-token', { token });

                if (res.data.valid) {
                    const quizData = {
                        name: res.data.formName,
                        form: res.data.formId,
                        time: res.data.timeLimit,
                        type: "Google Form",
                        date: new Date().toISOString() // Store current date
                    };
                    this.$store.dispatch('addQuiz', quizData); // Dispatch addQuiz action
                    this.$store.commit('setCurrentQuiz', quizData);

                    // After processing query token, remove
                    this.$router.replace({ path: this.$route.path, query: {} });
                } else {
                    Swal.fire("Error!", "Invalid token!", "error");
                }
            } catch (err) {
                Swal.fire("Error!", `Verification failed: ${err.message}`, "error");
            }
        },
        getQuizDetailsByFormId(formId) {
            const stored = localStorage.getItem('quizDetails');

            if (!stored) {
                return null; // No quizDetails found
            }

            try {
                const quizzes = JSON.parse(stored); // Convert to array

                const match = quizzes.find(quiz => quiz.form === formId);

                if (match) {
                    this.$store.commit('setCurrentQuiz', match);
                } else {
                    Swal.fire("Error!", "We don't have permissions to set timer for this form", "error");
                    this.clearQuizData();
                }

            } catch (error) {
                return null;
            }
        },
        clearQuizData() {
            this.$store.commit('setCurrentQuiz', null); // Clear the current quiz state in Vuex
        }
    },
    watch: {
        '$route.query.id': {
            handler(newId) {
                if (this.$route.path === '/form-link' && newId) {
                    this.getQuizDetailsByFormId(newId);
                }
            },
            immediate: true
        }
    }
}
</script>

<style scoped>
.quiz-container {
    max-width: 600px;
    text-align: center;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    background: #fff;
}

.sidebar {
    background-color: #2c3e5e;
    height: 100vh;
    color: white;
    width: 20vw;
}

.bicon {
    font-size: 2em;
    margin-left: 10px;
}</style>