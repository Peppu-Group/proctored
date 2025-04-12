<template>
    <div class="d-flex vh-100">
        <!-- Sidebar on the left -->

        <!-- Centered Quiz Container -->
        <div class="d-flex flex-grow-1 justify-content-center align-items-center bg-light" style="height: 100vh;">
            <div class="quiz-container p-4 bg-white rounded shadow" style="min-width: 300px;">
                <h2 class="fw-bold text-center mb-4">Register your info to start your quiz</h2>

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
</template>

<script>
import SideBar from '../components/SideBar.vue';
import axios from 'axios';
const serverUrl = `http://localhost:3000`;
const frontUrl = `http://127.0.0.1:5173`;

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
            if (this.$route.params.id && this.$route.query.name) {
                let link = `${frontUrl}/exam/${this.$route.params.id}`;
                let email = this.email;
                let name = this.fullName;
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
                            });
                            // Clear form fields
                            this.fullName = '';
                            this.email = '';
                            // Display success alert
                            Swal.fire('Success!', 'We have sent your test link to your mailbox', 'success');
                        } catch (err) {
                            console.log(err)
                        }
                    } else {
                        console.log('An error occurred, we could not register you for the test')
                    }
                } catch (err) {
                    console.log(err)
                }
            } else {
                console.log(`can't send mail`)
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