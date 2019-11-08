"use strict"

//---------------------------------------------------------
// AUTO-INCREMENTED COUNTERS FOR ID GENERATION
// idea: https://web.archive.org/web/20151009224806/http://docs.mongodb.org/manual/tutorial/create-an-auto-incrementing-field/
exports.getNextValue = function(collection, counterName) {
    return new Promise(async function(resolve, reject){
        let result = await collection.findOneAndUpdate(
            { name: counterName },
            { $inc: { value: 1 } },
            { 
                returnOriginal: false, // means returnNewDocument: true (see mongo driver doc)
                upsert: true 
            });
        resolve(result.value.value);
    });
}
