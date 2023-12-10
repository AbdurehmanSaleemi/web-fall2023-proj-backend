import { supabase } from '../supabase.js';
import Stripe from 'stripe';
import dotenv from "dotenv";
dotenv.config();


const stripe = new Stripe(process.env.STRIPE_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const Login = async (jwt) => {
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error) {
        console.error(error);
        return {
            user: null,
            id: null,
            status: 404
        };
    } else if (data?.user) {
        return {
            user: data.user.email,
            name: data.user.user_metadata?.name ? data.user.user_metadata.name : data.user.email,
            id: data.user.id,
            status: 200
        };
    }
    else {
        return {
            user: null,
            id: null,
            status: 404
        };
    }
}

export const webhooks = async (request, response) => {
    const sig = request.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
        response.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    // Handle the event
    switch (event.type) {
        case 'customer.subscription.deleted':
            const customerSubscriptionDeleted = event.data.object;
            console.log("The Customer Subscription is Deleted.");
            console.log(customerSubscriptionDeleted.customer);
            await supabase.from('Customers').update({
                plan: 1,
                trial: 2 //Trial Done
            }).eq('stripe_id', customerSubscriptionDeleted.customer);
            break;
        case 'customer.subscription.updated':
            const customerSubscriptionUpdated = event.data.object;

            if (customerSubscriptionUpdated.cancel_at_period_end) {
                return;
            }

            if (customerSubscriptionUpdated.status == 'active') {
                const plan = customerSubscriptionUpdated.plan;
                console.log(plan.active ? plan.product : "No Plan Active Currently")

                const plandata = await supabase.from('Plans').select('*').eq('plan_id', plan.product);

                await supabase.from('Customers').update({
                    plan: plandata.data[0].id ? plandata.data[0].id : 1,
                    sequences_available: plandata.data[0].sequence ? plandata.data[0].sequence : 3,
                }).eq('stripe_id', customerSubscriptionUpdated.customer);
            }

            console.log("The Customer Subscription is Updated.");
            break;
        case 'customer.subscription.created':
            const CustomerSubscriptionCreated = event.data.object;

            if (CustomerSubscriptionCreated.status == 'active') {
                const plan = CustomerSubscriptionCreated.plan;
                console.log(plan.active ? plan.product : "No Plan Active Currently")

                const plandata = await supabase.from('Plans').select('*').eq('plan_id', plan.product);

                await supabase.from('Customers').update({
                    plan: plandata.data[0].id ? plandata.data[0].id : 1,
                    sequences_available: plandata.data[0].sequence ? plandata.data[0].sequence : 3,
                }).eq('stripe_id', CustomerSubscriptionCreated.customer);
            }

            console.log("The Customer Subscription is Updated.");
            break;
        case 'customer.subscription.paused':
            const customerSubscriptionPaused = event.data.object;
            console.log("The Customer Subscription is Deleted.");
            await supabase.from('user').update({
                plan: 2,
            }).eq('stripe_id', customerSubscriptionPaused.customer);
            break;
        case 'customer.subscription.resumed':
            const customerSubscriptionResumed = event.data.object;
            console.log("The Customer Subscription is Deleted.");
            await supabase.from('user').update({
                plan: 1,
            }).eq('stripe_id', customerSubscriptionResumed.customer);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }
    response.status(200).send();
};

export const get_stripe = async (req, res) => {
    try {
        const { access_token, planid, success_url, cancel_url } = req.body;

        const usr = await Login(access_token);

        if (!usr || !usr.id) {
            return res.status(404).send("Error: User authentication failed or user not found.");
        }

        const [planResponse, userResponse] = await Promise.all([
            supabase.from("Plans").select("*").eq("id", planid),
            supabase.from("Customers").select("*").eq("id", usr.id)
        ]);

        const planData = planResponse.data;
        let userData = userResponse.data;
        let product = planData[0];
        let customer = userData[0];
        let session;


        if (!product) {
            return res.status(404).send("Error: Plan not found");
        }
        else if (!product.plan_id) {
            console.log("Creating Product......");
            let productdata = await stripe.products.create({
                name: planData[0].plan_name,
                default_price_data: {
                    unit_amount: planData[0].price*100,
                    currency: 'inr',
                    recurring: {
                        interval: 'month',
                    },
                },
            });

            product = (await supabase.from("Plans").update({ plan_id: productdata.id, price_id: productdata.default_price }).eq("id", planid).select()).data[0];
        }

        if (!customer.stripe_id) {
            console.log(usr);
            const stripecustomer = await stripe.customers.create({
                email: usr.user,
                name: usr.name,
            });
            customer = (await supabase.from("Customers").update({ stripe_id: stripecustomer.id }).eq("id", usr.id).select()).data[0];
        }

        console.log("Customer : ", customer);
        console.log("Product : ", product)

        try {

            session = await stripe.checkout.sessions.create({
                success_url: success_url,
                cancel_url: cancel_url,
                customer: customer.stripe_id,
                line_items: [{
                    price: product.price_id,
                    quantity: 1,
                }],
                currency: 'inr',
                // subscription_data: {
                //     trial_settings: {
                //         end_behavior: {
                //             missing_payment_method: 'pause',
                //         },
                //     },
                //     trial_period_days: 3,
                // },
                payment_method_collection: 'if_required',
                mode: 'subscription',
            });

            return res.status(200).json({
                'session_url': session.url,
            });
        }
        catch (err) {
            console.log(err)
            return res.status(500).json({ "error_message": "Error in creating checkout session", "error": err })
        }
    } catch (err) {
        console.log(err)
        return res.status(404).send({ "err": "Error: An unexpected error occurred " });
    }
};

export const get_stripe_list = async (req, res) => {
    try {
        const { access_token, ret_url } = req.body;
        const usr = await Login(access_token);

        console.log(usr);

        if (usr.status == 200) {
            const { data, error } = await supabase
                .from('Customers')
                .select('*')
                .eq('id', usr.id).single();

            if (error) {
                console.log('Error getting customer:', error.message);
                return res.status(400).send("Error : Some Customer Related Error Occured");
            } else {

                let cust = data;
                console.log('Customer retrieved successfully', data);
                let stripecustomer = null;
                if (!cust.stripe_id) {
                    console.log(usr);
                    const stripecustomer = await stripe.customers.create({
                        email: usr.user,
                        name: usr.name,
                    });
                    cust = (await supabase.from("Customers").update({ stripe_id: stripecustomer.id }).eq("id", usr.id).select()).data[0];
                }
                const customer = await stripe.billingPortal.sessions.create({
                    customer: cust.stripe_id ? cust.stripe_id : stripecustomer,
                    return_url: ret_url ? ret_url : null,
                });

                return res.status(200).send({ status: 2, msg: "success", link: customer });
            }
        }
    }
    catch (err) {
        console.log(err);
        return res.status(404).send("Error : Some User Related Error Occured");
    };
};