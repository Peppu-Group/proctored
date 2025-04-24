<template>
    <body>
    <div class="d-flex vh-100">
        <!-- Sidebar on the left -->

        <!-- Centered Quiz Container -->
        <div class="d-flex flex-grow-1 justify-content-center align-items-center bg-light" style="height: 100vh;">
            <div class="quiz-container p-4 bg-white rounded shadow" style="min-width: 300px;">
                <h2 class="fw-bold text-center mb-4 text-dark">Register your info to start your quiz</h2>

                <div class="mb-3">
                    <label for="fullName" class="form-label">Full Name</label>
                    <input type="text" id="fullName" class="form-control" placeholder="Enter your full name"
                        v-model="fullName">
                </div>

                <div class="mb-3">
                    <label for="email" class="form-label">Email Address</label>
                    <input type="email" id="email" class="form-control" placeholder="Enter your email" v-model="email">
                </div>

                <div class="d-grid">
                    <button class="btn btn-primary" @click="getLink()">Send Quiz Link</button>
                </div>
            </div>
        </div>

    </div>
</body>
</template>

<script>
import SideBar from '../components/SideBar.vue';
import axios from 'axios';
const serverUrl = `https://proctored.server.peppubuild.com`;
const frontUrl = `https://proctored.peppubuild.com`;

export default {
    name: 'MailView',
    components: { SideBar },

    data() {
        return {
            fullName: '',
            email: ''
        };
    },

    mounted() {


    },

    methods: {
        async getLink() {
            if (this.$route.params.id && this.$route.query.name && this.$route.query.email) {
                let time = this.$route.query.time;
                let link = `${frontUrl}/exam/${this.$route.params.id}/${time}`;
                let email = this.email;
                let name = this.fullName;
                let useremail = this.$route.query.email;
                try {
                    Swal.showLoading();
                    const res = await axios.post(`${serverUrl}/write-sheet`, {
                        sheet: this.$route.query.name,
                        name,
                        email,
                        status: 'Progress'
                    });

                    if (res) {
                        try {
                            await axios.post(`${serverUrl}/send-mail`, {
                                name,
                                email,
                                link,
                                test: this.$route.query.name,
                                useremail,
                            });
                            // Clear form fields
                            this.fullName = '';
                            this.email = '';
                            // Display success alert
                            Swal.fire('Success!', 'We have sent your test link to your mailbox', 'success');
                        } catch (err) {
                            // Clear form fields
                            this.fullName = '';
                            this.email = '';
                            Swal.fire("Error!", `An error occurred, could be your network connection: ${err}`, "error");
                        }
                    } else {
                        // Clear form fields
                        this.fullName = '';
                            this.email = '';
                        Swal.fire('Link Unavailable', `This link is unavailable because you have either registered for this exam or the organizer didn't include you as a participant`, 'error');
                    }
                } catch (err) {
                    // Clear form fields
                    this.fullName = '';
                    this.email = '';
                    Swal.fire("Error!", `An error occurred, could be your network connection: ${err}`, "error");
                }
            } else {
                // Clear form fields
                this.fullName = '';
                this.email = '';
                Swal.fire("Error!", `This link is broken, please ensure you have the correct link`, "error");
            }
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
}
</style>