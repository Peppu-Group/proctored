<template>

</template>

<script>
import swal from 'sweetalert';

export default {
    name: 'Success',

    mounted() {
        // make sure traffic is coming from /exams. else, redirect to 404.
        swal({
            title: "Good job!",
            text: "You have finished with your test. Please do not contact us about your result, the owner of the test will contact you. ",
            icon: "success",
            button: "Finish",
        }).then(() => {
            this.$router.push('/')
        })
    }
}
</script>