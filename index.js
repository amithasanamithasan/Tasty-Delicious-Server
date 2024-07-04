const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();

const port = process.env.PORT || 5000;

// middeleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1gieptu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    
    const userCollection = client.db("restaurantDb").collection("users");
    const menuCollection = client.db("restaurantDb").collection("menu");
    const reviewsCollection = client.db("restaurantDb").collection("reviews");
    const cartCollection = client.db("restaurantDb").collection("carts");
    const paymentCollection = client.db("restaurantDb").collection("payments");
// jwt releted api
// Create A JWT Token And Save It On Local Storage
app.post('/jwt', async(req,res)=>{
  const user= req.body;
  const token=jwt.sign(user,process.env.ACCESS_TOKEN, {
    expiresIn:'1hr' });
    res.send({ token });
})


// middelware all users verify token
// Create A JWT Token And Save It On Local Storage
const verifyToken=(req,res,next)=>{
  // inside veryify token show command from
  console.log('inside veryify token',req.headers.authorization);
  if(!req.headers. authorization){
    return res.status(401).send({message:'forbidden access'});

    }
    const token =req.headers.authorization.split(' ')[1]
  // verifye token
  jwt.verify(token,process.env.ACCESS_TOKEN,(err,decoded)=>{
if(err){
  return res.status(401).send({massage:'forbidden access'})
}
req.decoded=decoded;
next();

  })
}
// use verify admin after verifyToken
// User Api Secure Using Verify Admin
const verifyAdmin =async(req,res,next)=>{
  const email=req.decoded.email;
  const query={email:email};
  const user=await userCollection.findOne(query);
  const isAdmin=user?.role ==='admin';
  if(!isAdmin){
    return res.status(403).send({message:'forbidden access'});

  }
  next();



}



// admin deshboard signup alluser innformation show
   app.get('/users', verifyToken,verifyAdmin ,async(req,res)=>{
     const result= await userCollection.find().toArray();
     res.send(result);

   }); 

  //  User Api Secure Using Verify Admin
   app.get('/users/admin/:email', verifyToken,async(req,res)=>{
   const email =req.params.email;
   if( email!== req.decoded.email){
    return res.status(403).send({message:"unauthorized access"})
   }
   const query={email:email};
   const user =await userCollection.findOne(query);
   let admin= false;
   if(user){
    admin=user?.role ==='admin';

   }
   res.send({admin});
   })
   

// users releted api
app.post('/users',  async (req,res)=>{
 
  const user = req.body;
  // social log in user email exists or not 
  const query = { email: user.email };

  try {
    // Await the promise here
    const socialLoginExists = await userCollection.findOne(query); 
    if (socialLoginExists) {
      return res.send({ message: 'User already existed in database', insertedId: null });
    }

    const result = await userCollection.insertOne(user);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Error checking user existence or inserting user', error });
  }
});

// kw ke jodi amra admin korte cie tahole backend e akta api lagbe
// particuller kono field ke change korte chie tahole patch use kori
app.patch('/users/admin/:id',verifyToken,verifyAdmin,async(req,res)=>{

  const id =req.params.id;
  const filter={_id: new ObjectId(id)}
  // tumi kon field ta ke update korba r ki
  const updateDoc = {
    $set: {
      role:
        "admin",
    },
  };
  const result = await userCollection.updateOne(filter, updateDoc);
res.send(result);
})




// admin dashbord deleted user 
app.delete('/users/:id',verifyToken,verifyAdmin,async(req,res)=>{
  const id=req.params.id;
  const query={_id: new ObjectId(id)}
  const result= await userCollection.deleteOne(query);
  res.send(result)
});
// payment intent card pay
app.post ('/create-payment-intent', async (req, res) => {
  const { price } = req.body;
  const amount=parseInt(price*100);

  // Create a PaymentIntent with the order amount and currency
  const paymentIntent = await stripe.paymentIntents.create({
    amount:amount,
    currency:'usd',
    payment_method_types: ["card"]
  });
  res.send({
    clientSecret:paymentIntent.client_secret
  })
  });
  // payment History
  app.get('/payments/:email', verifyToken, async (req,res)=>{
    const query={ email: req.params.email }
    if(req.params.email !== req.decoded.email){
      return res.status(403).send({massage:'forbidden access'});
    }
    const result= await paymentCollection.find().toArray()
    res.send(result)

  })

  // payment cart in database
  app.post('/payments', verifyToken,verifyAdmin, async (req,res)=>{
    const payment= req.body;
    const paymentResult=await paymentCollection.insertOne(payment);
    // carefully delete each item from cart
    console.log('payment info',payment);
    const query ={_id: 
      {
      $in:payment.cartIds.map(id =>  new ObjectId(id))
    }};
  const deleteResult= await cartCollection.deleteMany(query);
    res.send({paymentResult ,deleteResult});


  });
  // Create Admin Dashboard Stats Api
// adminHome dashboard all customer total revenue total customar total products total order
app.get('/admin-stats',  async (req, res) => {
  const usersCustomers= await userCollection.estimatedDocumentCount()
  const menuItemProducts= await menuCollection.estimatedDocumentCount()
  const order= await cartCollection.estimatedDocumentCount()
// revenue not best solution code
// const payments= await paymentCollection.find().toArray();
// const revenue=payments.reduce((total, payment)=>total+payment,0)

// total revenue api display adminHome dashboard
const result = await paymentCollection.aggregate([
  {
    $group:{
      // shobguke group kora _id null mane shobgula
      _id:null,
      totalRevenue:{
        // $sum build in oparator
        $sum:'$price'
      }
    }
  }
]).toArray();
// result er length jodi base hoie thole amra result er moddhe first upadan ta ke nibo 
// ,nia setar moddhe totalRevenue take dekhabo, nile 0 dia dibo
const revenue= result.length >0 ? result[0].totalRevenue : 0; 

  res.send({
    usersCustomers,
    menuItemProducts,
    order,
    revenue
  
   

  })
})


app.get('/menu',async (req,res)=>{
    const result=await menuCollection.find().toArray()
    res.send(result);
})

// admin addItem data menu filed set in database
// Save Menu Item To The Server And Make Api Secure
app.post('/menu', verifyToken, verifyAdmin ,async(req,res)=>{
  const additem=req.body;
  const result= await menuCollection.insertOne(additem);
  res.send(additem);

});
// Admin manageItems deleted admindashboard
app.delete('/menu/:id',verifyToken,verifyAdmin, async(req,res)=>{
  const id= req.params.id;
  const query= { _id: new ObjectId(id)}
  const result= await menuCollection.deleteOne(query)
  res.send(result)
});

// admin updateItem show dashboard
app.get('/menu/:id',async(req,res)=>{
const id=req.params.id;
const query={ _id: new ObjectId(id)}
const result= await menuCollection.findOne(query)
res.send(result)
});

// update item change data admin should update anything admin want to it
app.patch('/menu/:id',async(req,res)=>{
  const item=req.body;
  const id=req.params.id;
  const filter={_id: new ObjectId(id)};
  const updateDoc = {
    $set: {
     name:item.name,
     category:item.category,
     price:item.price,
     recipe:item.recipe,
     image:item.image
    },
  };
  const result = await menuCollection.updateOne(filter, updateDoc);
  res.send(result);
})


app.get('/reviews',async (req,res)=>{
    const result=await reviewsCollection.find().toArray()
    res.send(result);
})




// user stats
app.get('/user-stats', async (req, res) => {

  const menuItemProducts= await menuCollection.estimatedDocumentCount()
  const order= await cartCollection.estimatedDocumentCount()
// revenue not best solution code
// const payments= await paymentCollection.find().toArray();
// const revenue=payments.reduce((total, payment)=>total+payment,0)

// total revenue api display adminHome dashboard
const result = await paymentCollection.aggregate([
  {
    $group:{
      // shobguke group kora _id null mane shobgula
      _id:null,
      totalRevenue:{
        // $sum build in oparator
        $sum:'$price'
      }
    }
  }
]).toArray();
// result er length jodi base hoie thole amra result er moddhe first upadan ta ke nibo 
// ,nia setar moddhe totalRevenue take dekhabo, nile 0 dia dibo
 

  res.send({
 
    menuItemProducts,
    order,

  
   

  })
})





// carts collection
// navbar cart added
app.get('/carts' , async(req,res)=>{
  const email=req.query.email;
  const query={email: email};
  const result=await cartCollection.find(query).toArray();
  res.send(result); 
});
 
app.post('/carts', async (req,res)=>{
  const cartItem =req.body;
  const result= await cartCollection.insertOne(cartItem);
  res.send(result);

});

// dashboard cart deleted user add to cart 
app.delete('/carts/:id', async(req,res)=>{
 const id= req.params.id;
 const query={ _id: new ObjectId(id)}
 const result= await cartCollection.deleteOne(query);
 res.send(result);

})

// using aggregate pipeline pie chart
// Get Order Quantity And Revenue By Category

app.get('/order-stats', async(req,res)=>{
  const result = await paymentCollection.aggregate([
    // $unwind hoccche protita menuitemId array thake akta akta menuitemId ber kora
    {
      $unwind:'$menueItemsIds'
    },
    {
      $lookup:{
        from:'menu',
        localField:'menueItemsIds',
        foreignField:'_id',
        as:'menuItems'

      }
    },
    {
      $unwind:'$menuItems'
    },
    {
      $group:{
        _id:'$menuItems.category',
        quantity:{$sum:1},
        revenue:{$sum:'$menuItems.price'}
      }
    },
    {
      $project:{_id:0,
        category:'$_id',
        quantity:'$quantity',
        revenue:'$revenue'
      }
    }

  ]).toArray();
  res.send(result);

})




    
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/',(req, res)=>{
    res.send('testy delicious resturant')
})

app.listen(port, ()=>{
    console.log(`testy delicious rasturant is running on port ${port}`);
})